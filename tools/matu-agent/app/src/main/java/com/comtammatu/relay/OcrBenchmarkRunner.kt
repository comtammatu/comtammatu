package com.comtammatu.relay

import android.content.Context
import android.util.Base64
import java.io.File

class OcrBenchmarkRunner(
    private val context: Context,
    private val dbHelper: OrderQueueDbHelper
) {
    suspend fun run(): File {
        val orders = dbHelper.getOrdersWithPayloads()
        val mlKit = ReceiptTextRecognizer()
        val stored = mutableListOf<OcrEngineSample>()
        val mlkitSamples = mutableListOf<OcrEngineSample>()
        val rows = mutableListOf<org.json.JSONObject>()
        try {
            for (order in orders) {
                val raw = runCatching {
                    Base64.decode(order.rawBase64, Base64.DEFAULT)
                }.getOrNull()
                if (raw == null || raw.isEmpty()) continue
                val storedSample = OcrBenchmark.scoreStored(order.receiptText)
                val mlkitSample = OcrBenchmark.sample(mlKit.recognizeDetailed(raw))
                stored += storedSample
                mlkitSamples += mlkitSample
                rows += OcrBenchmark.rowJson(
                    order.id,
                    order.status,
                    order.sourceOrderRef,
                    order.posOrderNumber,
                    listOf(storedSample, mlkitSample)
                )
                AppLogger.i(
                    "OCR",
                    "Đối chiếu phiếu #${order.id}: lưu ${storedSample.score.completion} · " +
                        "ML Kit ${mlkitSample.score.completion}/${mlkitSample.elapsedMs}ms"
                )
            }
        } finally {
            mlKit.close()
        }

        val report = OcrBenchmark.reportJson(
            System.currentTimeMillis(),
            listOf(
                OcrBenchmark.summarize(OcrBenchmark.ENGINE_STORED, stored),
                OcrBenchmark.summarize(ReceiptTextRecognizer.ENGINE_MLKIT_PREPROCESS, mlkitSamples)
            ),
            rows
        )
        val file = File(context.filesDir, OcrBenchmark.FILE_NAME)
        file.writeText(report.toString(2))
        File(context.filesDir, OcrBenchmark.DONE_NAME).writeText(file.absolutePath)
        AppLogger.s(
            "OCR",
            "OCR_BENCH_DONE file=${file.name} receipts=${rows.size}"
        )
        return file
    }
}
