package com.comtammatu.relay

import org.json.JSONArray
import org.json.JSONObject

data class OcrEngineSample(
    val engine: String,
    val elapsedMs: Long,
    val score: ReceiptOcrScore,
    val rawScore: ReceiptOcrScore,
    val text: String?,
    val rawText: String?
)

object OcrBenchmark {
    const val ENGINE_STORED = "stored_mlkit"
    const val FILE_NAME = "ocr_bench.json"
    const val DONE_NAME = "ocr_bench.done"

    fun scoreStored(text: String?): OcrEngineSample {
        val score = ReceiptOcrQuality.score(text)
        return OcrEngineSample(ENGINE_STORED, 0, score, score, text, text)
    }

    fun sample(result: ReceiptOcrResult): OcrEngineSample =
        OcrEngineSample(
            result.engine,
            result.elapsedMs,
            ReceiptOcrQuality.score(result.text),
            ReceiptOcrQuality.score(result.rawText),
            result.text,
            result.rawText
        )

    fun summarize(engine: String, samples: List<OcrEngineSample>): JSONObject {
        val count = samples.size
        val completions = samples.map { it.score.completion }
        val elapsed = samples.map { it.elapsedMs }
        return JSONObject()
            .put("engine", engine)
            .put("receiptCount", count)
            .put("meanCompletion", meanInts(completions))
            .put("meanRawCompletion", meanInts(samples.map { it.rawScore.completion }))
            .put("orderRefRate", rate(samples.count { it.score.hasOrderRef }, count))
            .put("shopeeRate", rate(samples.count { it.score.hasShopee }, count))
            .put("meanDiacritics", meanInts(samples.map { it.score.diacriticCount }))
            .put("meanDefects", meanInts(samples.map { it.score.defectCount }))
            .put("meanRawDefects", meanInts(samples.map { it.rawScore.defectCount }))
            .put("meanMenuHits", meanInts(samples.map { it.score.menuHitCount }))
            .put("meanElapsedMs", meanLongs(elapsed))
            .put("minElapsedMs", elapsed.minOrNull() ?: 0)
            .put("maxElapsedMs", elapsed.maxOrNull() ?: 0)
    }

    fun rowJson(
        orderId: Long,
        status: String,
        sourceOrderRef: String?,
        posOrderNumber: String?,
        samples: List<OcrEngineSample>
    ): JSONObject {
        val row = JSONObject()
            .put("id", orderId)
            .put("status", status)
            .put("sourceOrderRef", sourceOrderRef ?: JSONObject.NULL)
            .put("posOrderNumber", posOrderNumber ?: JSONObject.NULL)
        for (sample in samples) {
            row.put(
                sample.engine,
                JSONObject()
                    .put("elapsedMs", sample.elapsedMs)
                    .put("completion", sample.score.completion)
                    .put("hasShopee", sample.score.hasShopee)
                    .put("hasOrderRef", sample.score.hasOrderRef)
                    .put("diacriticCount", sample.score.diacriticCount)
                    .put("defectCount", sample.score.defectCount)
                    .put("menuHitCount", sample.score.menuHitCount)
                    .put("rawCompletion", sample.rawScore.completion)
                    .put("rawDefectCount", sample.rawScore.defectCount)
                    .put("text", sample.text ?: JSONObject.NULL)
                    .put("rawText", sample.rawText ?: JSONObject.NULL)
            )
        }
        return row
    }

    fun reportJson(
        generatedAt: Long,
        summaries: List<JSONObject>,
        rows: List<JSONObject>
    ): JSONObject {
        val engines = JSONObject()
        for (summary in summaries) {
            engines.put(summary.getString("engine"), summary)
        }
        return JSONObject()
            .put("generatedAt", generatedAt)
            .put("receiptCount", rows.size)
            .put("engines", engines)
            .put("rows", JSONArray(rows))
    }

    private fun meanInts(values: List<Int>): Double =
        if (values.isEmpty()) 0.0 else values.sum().toDouble() / values.size

    private fun meanLongs(values: List<Long>): Double =
        if (values.isEmpty()) 0.0 else values.sum().toDouble() / values.size

    private fun rate(hits: Int, count: Int): Double =
        if (count == 0) 0.0 else hits.toDouble() / count
}
