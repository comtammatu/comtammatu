package realtime

import (
	"sync"
	"testing"
)

func ptr(v int64) *int64 { return &v }

func TestEventMatches(t *testing.T) {
	tests := []struct {
		name      string
		event     Event
		subTenant int64
		subBranch int64
		wantMatch bool
	}{
		{
			name:      "same tenant same branch matches",
			event:     Event{TenantID: 1, BranchID: ptr(10)},
			subTenant: 1, subBranch: 10,
			wantMatch: true,
		},
		{
			name:      "same tenant different branch does not match",
			event:     Event{TenantID: 1, BranchID: ptr(10)},
			subTenant: 1, subBranch: 99,
			wantMatch: false,
		},
		{
			name:      "different tenant never matches even with same branch",
			event:     Event{TenantID: 2, BranchID: ptr(10)},
			subTenant: 1, subBranch: 10,
			wantMatch: false,
		},
		{
			name:      "tenant-wide event (nil branch) reaches any branch in tenant",
			event:     Event{TenantID: 1, BranchID: nil},
			subTenant: 1, subBranch: 77,
			wantMatch: true,
		},
		{
			name:      "tenant-wide event does not cross tenants",
			event:     Event{TenantID: 1, BranchID: nil},
			subTenant: 2, subBranch: 77,
			wantMatch: false,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.event.matches(tt.subTenant, tt.subBranch); got != tt.wantMatch {
				t.Errorf("matches() = %v, want %v", got, tt.wantMatch)
			}
		})
	}
}

func TestHubPublishFanOut(t *testing.T) {
	h := NewHub()
	// Two subscribers in tenant 1 (branch 10 and 20), one in tenant 2.
	t1b10 := h.Subscribe(1, 10)
	t1b20 := h.Subscribe(1, 20)
	t2b10 := h.Subscribe(2, 10)

	if got := h.SubscriberCount(); got != 3 {
		t.Fatalf("SubscriberCount() = %d, want 3", got)
	}

	// Branch-scoped event for tenant 1 / branch 10 → only t1b10.
	h.Publish(Event{Table: "kds_tickets", TenantID: 1, BranchID: ptr(10), RowID: 5, Op: OpInsert})
	assertRecv(t, "t1b10", t1b10, Event{Table: "kds_tickets", TenantID: 1, BranchID: ptr(10), RowID: 5, Op: OpInsert})
	assertEmpty(t, "t1b20", t1b20)
	assertEmpty(t, "t2b10", t2b10)

	// Tenant-wide event for tenant 1 → both tenant-1 subscribers, not tenant 2.
	h.Publish(Event{Table: "pos_sessions", TenantID: 1, BranchID: nil, RowID: 9, Op: OpUpdate})
	assertRecv(t, "t1b10", t1b10, Event{Table: "pos_sessions", TenantID: 1, BranchID: nil, RowID: 9, Op: OpUpdate})
	assertRecv(t, "t1b20", t1b20, Event{Table: "pos_sessions", TenantID: 1, BranchID: nil, RowID: 9, Op: OpUpdate})
	assertEmpty(t, "t2b10", t2b10)
}

func TestHubUnsubscribe(t *testing.T) {
	h := NewHub()
	s := h.Subscribe(1, 10)
	h.Unsubscribe(s)

	if got := h.SubscriberCount(); got != 0 {
		t.Fatalf("SubscriberCount() after Unsubscribe = %d, want 0", got)
	}
	// Channel must be closed.
	if _, ok := <-s.C; ok {
		t.Fatal("subscriber channel should be closed after Unsubscribe")
	}
	// Second Unsubscribe is a no-op (must not panic on double close).
	h.Unsubscribe(s)
	// Publish after Unsubscribe must not panic or deliver.
	h.Publish(Event{TenantID: 1, BranchID: ptr(10), RowID: 1, Op: OpInsert})
}

func TestHubDropsOnFullChannel(t *testing.T) {
	h := NewHub()
	s := h.Subscribe(1, 10)
	// Fill the buffer + overflow without anyone reading.
	total := subscriberChanBuffer + 10
	for i := 0; i < total; i++ {
		h.Publish(Event{TenantID: 1, BranchID: ptr(10), RowID: int64(i), Op: OpInsert})
	}
	if got := s.Dropped(); got != 10 {
		t.Errorf("Dropped() = %d, want 10", got)
	}
	// The buffered events are still readable — drop must not corrupt the channel.
	if len(s.C) != subscriberChanBuffer {
		t.Errorf("buffered len = %d, want %d", len(s.C), subscriberChanBuffer)
	}
}

func TestHubConcurrentPublishAndSubscribe(t *testing.T) {
	h := NewHub()
	var wg sync.WaitGroup

	// Churn subscribers while publishing — the race detector validates the
	// RWMutex discipline. Drain channels so Publish never blocks.
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			s := h.Subscribe(1, 10)
			done := make(chan struct{})
			go func() {
				for range s.C {
				}
				close(done)
			}()
			h.Unsubscribe(s)
			<-done
		}()
	}
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func(id int64) {
			defer wg.Done()
			h.Publish(Event{TenantID: 1, BranchID: ptr(10), RowID: id, Op: OpUpdate})
		}(int64(i))
	}
	wg.Wait()

	if got := h.SubscriberCount(); got != 0 {
		t.Errorf("SubscriberCount() after churn = %d, want 0", got)
	}
}

func assertRecv(t *testing.T, name string, s *Subscriber, want Event) {
	t.Helper()
	select {
	case got := <-s.C:
		if got.Table != want.Table || got.TenantID != want.TenantID ||
			got.RowID != want.RowID || got.Op != want.Op {
			t.Errorf("%s received %+v, want %+v", name, got, want)
		}
		if (got.BranchID == nil) != (want.BranchID == nil) {
			t.Errorf("%s BranchID nil-ness mismatch: got %v want %v", name, got.BranchID, want.BranchID)
		}
		if got.BranchID != nil && want.BranchID != nil && *got.BranchID != *want.BranchID {
			t.Errorf("%s BranchID = %d, want %d", name, *got.BranchID, *want.BranchID)
		}
	default:
		t.Errorf("%s expected an event, channel was empty", name)
	}
}

func assertEmpty(t *testing.T, name string, s *Subscriber) {
	t.Helper()
	select {
	case got := <-s.C:
		t.Errorf("%s expected no event, got %+v", name, got)
	default:
	}
}
