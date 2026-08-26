package com.sunmi.peripheral.printer;

/**
 * SUNMI Printer Inner Result Callback Interface
 */
interface InnerResultCallback {
    oneway void onRunResult(boolean isSuccess, int code, String msg);
    oneway void onReturnString(String result);
    oneway void onRaiseException(int code, String msg);
    oneway void onPrintResult(int code, String msg);
}
