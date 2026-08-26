package com.sunmi.peripheral.printer;

import com.sunmi.peripheral.printer.InnerResultCallback;

/**
 * SUNMI Printer Service AIDL Interface
 */
interface SunmiPrinterService {
    int updatePrinterState();
    void getPrinterVersion(InnerResultCallback callback);
    void getPrinterPaper(InnerResultCallback callback);
    void sendRAWData(in byte[] data, InnerResultCallback callback);
    void printTextWithFont(String text, String typeface, float fontsize, InnerResultCallback callback);
    void cutPaper(InnerResultCallback callback);
    int getPrinterMode();
}
