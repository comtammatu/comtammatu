export const auth = {
  loginSuccess: "Đăng nhập thành công",
  loginFailed: "Sai email hoặc mật khẩu",
  logoutSuccess: "Đã đăng xuất",
  sessionExpired: "Phiên đăng nhập hết hạn, vui lòng đăng nhập lại",
  mfa: {
    settingsTitle: "Bảo mật đăng nhập",
    settingsDescription:
      "Bật xác thực hai lớp (TOTP) cho tài khoản Chủ sở hữu. Không bắt buộc; cần phiên AAL2 khi sửa phân quyền hệ thống.",
    loading: "Đang tải trạng thái MFA...",
    statusLabel: "MFA",
    statusEnabled: "Đã bật",
    statusDisabled: "Chưa bật",
    aalLabel: "Phiên",
    emptyFactors: "Tài khoản chưa gắn ứng dụng xác thực.",
    enableButton: "Bật MFA",
    enrolling: "Đang tạo mã QR...",
    enrollInstructions:
      "Quét mã QR bằng ứng dụng xác thực, rồi nhập mã 6 số để xác nhận.",
    qrAlt: "Mã QR MFA",
    secretLabel: "Mã bí mật (nếu không quét được QR)",
    confirmEnroll: "Xác nhận bật MFA",
    cancelEnroll: "Hủy",
    enrollSuccess: "Đã bật xác thực hai lớp.",
    defaultFactorName: "Ứng dụng xác thực",
    totpFactorHint: "Mã 6 số từ ứng dụng xác thực (TOTP).",
    unenrollAria: "Tắt MFA",
    unenrollTitle: "Tắt xác thực hai lớp?",
    unenrollDescription:
      "Sau khi tắt, đăng nhập chỉ cần mật khẩu. Sửa phân quyền vẫn yêu cầu AAL2.",
    unenrollConfirm: "Tắt MFA",
    unenrolling: "Đang tắt...",
    unenrollSuccess: "Đã tắt xác thực hai lớp.",
    cancel: "Hủy",
    codeLabel: "Mã xác thực",
    codePlaceholder: "6 chữ số",
    codeInvalid: "Nhập đủ 6 chữ số từ ứng dụng xác thực.",
    verifying: "Đang xác thực...",
    verifySubmit: "Xác nhận",
    verifyAndContinue: "Xác nhận và tiếp tục",
    challengeDescription: "Nhập mã 6 số từ ứng dụng xác thực của bạn.",
    loginChallengeTitle: "Xác thực hai lớp",
    loginChallengeDescription:
      "Tài khoản đã bật MFA. Nhập mã từ ứng dụng xác thực để hoàn tất đăng nhập.",
    stepUpTitle: "Xác thực lại để tiếp tục",
    stepUpDescription:
      "Thay đổi phân quyền yêu cầu phiên AAL2. Nhập mã MFA để tiếp tục.",
    stepUpBeforeUnenroll:
      "Cần xác thực MFA trước khi tắt yếu tố xác thực trên tài khoản này.",
    stepUpMissingFactor:
      "Cần phiên AAL2 để sửa phân quyền. MFA hiện chỉ dành cho Chủ sở hữu — hãy đăng nhập bằng tài khoản Chủ sở hữu đã bật MFA, hoặc nhờ Chủ sở hữu thực hiện.",
    goToSecuritySettings: "Mở cài đặt bảo mật",
    noFactorForStepUp: "Không tìm thấy yếu tố MFA đã xác minh.",
    pages: {
      settingsSecurityTitle: "Bảo mật",
      settingsSecurityDescription:
        "Quản lý xác thực hai lớp cho tài khoản chủ sở hữu.",
      settingsCardTitle: "Bảo mật đăng nhập",
      settingsCardDescription:
        "Bật MFA (TOTP) tùy chọn cho tài khoản Chủ sở hữu.",
    },
  },
} as const;
