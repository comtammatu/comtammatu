import { toast, type ExternalToast } from "sonner"

export type NotifyOptions = ExternalToast

const FALLBACK_ERROR = "Có lỗi xảy ra, vui lòng thử lại"

export const notify = {
  success(msg: string, opts?: NotifyOptions) {
    return toast.success(msg, opts)
  },
  error(msg?: string | null, opts?: NotifyOptions) {
    return toast.error(msg ?? FALLBACK_ERROR, opts)
  },
  warning(msg: string, opts?: NotifyOptions) {
    return toast.warning(msg, opts)
  },
  info(msg: string, opts?: NotifyOptions) {
    return toast.info(msg, opts)
  },
  loading(msg: string, opts?: NotifyOptions) {
    return toast.loading(msg, opts)
  },
  promise<T>(
    p: Promise<T>,
    m: {
      loading: string
      success: string | ((data: T) => string)
      error?: string | ((err: unknown) => string)
    },
  ) {
    return toast.promise(p, {
      loading: m.loading,
      success: m.success,
      error: m.error ?? FALLBACK_ERROR,
    })
  },
  dismiss(id?: string | number) {
    return toast.dismiss(id)
  },
}

export { FALLBACK_ERROR }
