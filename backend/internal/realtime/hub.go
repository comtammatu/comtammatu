// Package realtime is the Go-native replacement for Supabase Realtime
// (DB migration plan §3.B). The flow is:
//
//	Postgres AFTER-trigger → pg_notify → Go LISTEN loop → Hub.Publish →
//	per-subscriber channel → WebSocket frame → FE POS PWA / KDS.
//
// This file is the Hub: an in-process fan-out from one event stream to
// many tenant/branch-scoped subscribers. It has no DB or network
// dependency so it can be unit-tested in isolation; the LISTEN loop and
// the WebSocket endpoint wrap it.
package realtime

import "sync"

// Operation is the SQL operation that produced an Event.
type Operation string

const (
	OpInsert Operation = "INSERT"
	OpUpdate Operation = "UPDATE"
	OpDelete Operation = "DELETE"
)

// Event is the payload carried from a Postgres NOTIFY to subscribers.
// It deliberately carries only identifiers, never row bodies — the FE
// treats realtime as a "something changed, go refetch" hint, and keeping
// the payload tiny stays well under Postgres's 8 KB NOTIFY limit.
type Event struct {
	Table    string    `json:"table"`
	TenantID int64     `json:"tenant_id"`
	BranchID *int64    `json:"branch_id,omitempty"` // nil = tenant-wide event
	RowID    int64     `json:"row_id"`
	Op       Operation `json:"op"`
}

// matches reports whether the event is visible to a subscriber scoped to
// (tenantID, branchID). Tenant must always match; a nil event BranchID is
// tenant-wide and reaches every branch, otherwise the branch must match.
func (e Event) matches(tenantID, branchID int64) bool {
	if e.TenantID != tenantID {
		return false
	}
	if e.BranchID == nil {
		return true
	}
	return *e.BranchID == branchID
}

// subscriberChanBuffer is the per-subscriber channel depth. On overflow the
// Hub drops the event rather than blocking the publish path — the FE's
// reconnect-and-refetch gap recovery makes a dropped hint safe, and one
// slow WebSocket client must never stall the shared LISTEN loop.
const subscriberChanBuffer = 64

// Subscriber is a single tenant/branch-scoped consumer. Read events from C;
// the Hub closes C on Unsubscribe.
type Subscriber struct {
	TenantID int64
	BranchID int64
	C        chan Event

	dropped uint64 // events discarded because C was full; read via Dropped()
}

// Dropped returns the number of events discarded for this subscriber
// because its channel was full. Surfaced for metrics/observability.
func (s *Subscriber) Dropped() uint64 { return s.dropped }

// Hub fans one event stream out to many subscribers. Safe for concurrent
// use: Publish runs under an RLock so multiple publishers don't serialize,
// while Subscribe/Unsubscribe take the write lock.
type Hub struct {
	mu   sync.RWMutex
	subs map[*Subscriber]struct{}
}

// NewHub returns an empty Hub ready for use.
func NewHub() *Hub {
	return &Hub{subs: make(map[*Subscriber]struct{})}
}

// Subscribe registers a consumer scoped to (tenantID, branchID) and returns
// it. The caller must call Unsubscribe when done to free the channel.
func (h *Hub) Subscribe(tenantID, branchID int64) *Subscriber {
	s := &Subscriber{
		TenantID: tenantID,
		BranchID: branchID,
		C:        make(chan Event, subscriberChanBuffer),
	}
	h.mu.Lock()
	h.subs[s] = struct{}{}
	h.mu.Unlock()
	return s
}

// Unsubscribe removes s from the Hub and closes its channel. Idempotent:
// a second call on the same subscriber is a no-op.
func (h *Hub) Unsubscribe(s *Subscriber) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if _, ok := h.subs[s]; !ok {
		return
	}
	delete(h.subs, s)
	close(s.C)
}

// Publish fans e out to every subscriber whose scope matches. The send is
// non-blocking — if a subscriber's channel is full the event is dropped
// for that subscriber and its dropped counter is incremented.
func (h *Hub) Publish(e Event) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for s := range h.subs {
		if !e.matches(s.TenantID, s.BranchID) {
			continue
		}
		select {
		case s.C <- e:
		default:
			s.dropped++
		}
	}
}

// SubscriberCount returns the number of active subscribers. For tests and
// metrics.
func (h *Hub) SubscriberCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.subs)
}
