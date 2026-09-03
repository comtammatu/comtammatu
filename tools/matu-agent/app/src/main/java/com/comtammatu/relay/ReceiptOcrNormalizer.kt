package com.comtammatu.relay

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

data class OcrPositionedLine(
    val text: String,
    val left: Int,
    val top: Int,
    val right: Int,
    val bottom: Int
) {
    val centerY: Double get() = (top + bottom) / 2.0
    val height: Int get() = max(1, bottom - top)
}

/** Reconstructs visual receipt rows because ML Kit block order is column-first. */
object ReceiptOcrLayout {
    private data class Row(val lines: MutableList<OcrPositionedLine>) {
        val centerY: Double get() = lines.map(OcrPositionedLine::centerY).average()
        val averageHeight: Double get() = lines.map { it.height }.average()
    }

    fun rebuild(lines: List<OcrPositionedLine>): String {
        val rows = mutableListOf<Row>()
        for (line in lines.filter { it.text.isNotBlank() }.sortedBy(OcrPositionedLine::centerY)) {
            val matchingRow = rows.minByOrNull { abs(it.centerY - line.centerY) }
            val tolerance = matchingRow?.let {
                max(4.0, min(it.averageHeight, line.height.toDouble()) * 0.6)
            } ?: 0.0

            if (matchingRow != null && abs(matchingRow.centerY - line.centerY) <= tolerance) {
                matchingRow.lines.add(line)
            } else {
                rows.add(Row(mutableListOf(line)))
            }
        }

        return rows
            .sortedBy(Row::centerY)
            .joinToString("\n") { row ->
                row.lines
                    .sortedBy(OcrPositionedLine::left)
                    .joinToString(" ") { it.text.trim() }
            }
    }
}

/** Converts Shopee raster OCR into text understood by old and new relay parsers. */
object RasterReceiptTextNormalizer {
    private data class NormalizedSide(
        val name: String,
        val quantity: Int
    )

    private val itemNameAliases = mapOf(
        "com suon cot let" to "Sườn Cốt Lết",
        "com suon cong" to "Sườn Cọng",
        "com suon mot gang" to "Sườn Một Gang",
        "com tam bi" to "Cơm Tấm Bì",
        "trung" to "Trứng",
        "cha" to "Chả",
        "top mo" to "Tóp Mỡ",
        "tra taac" to "Trà Tắc"
    )
    private val standaloneSoupAliases = mapOf(
        "canh kho qua" to "Canh Khổ Qua",
        "canh chua tom" to "Canh Chua Tôm"
    )
    private val orderLabel = Regex(
        "^(?:Mã\\s*đơn(?:\\s*hàng)?|Mã\\s*đặt\\s*món|Order\\s*ID)\\s*:?[\\s#]*$",
        RegexOption.IGNORE_CASE
    )
    private val orderCode = Regex("^(?=.*\\d)[A-Z0-9_-]{5,}$", RegexOption.IGNORE_CASE)
    private val numberedItem = Regex("^\\d+[.)]\\s*([\\p{L}].*)$")
    private val detachedPrice = Regex(
        "^(?:[xX]\\s*(\\d+)|(\\d+)\\s*[xX])\\s+([\\d.,]+)\\s*(?:đ|d|g|vnd)?$",
        RegexOption.IGNORE_CASE
    )
    private val bareDetachedPrice = Regex(
        "^([\\d.,]+)\\s*(?:đ|d|g|vnd)?$",
        RegexOption.IGNORE_CASE
    )
    private val sideLine = Regex("^[+\\-*•>]\\s*(.+)$")
    private val sideQuantity = Regex(
        "^(?:(\\d+)|[Il1])\\s*[xX]\\s*(.+)$",
        RegexOption.IGNORE_CASE
    )
    private val receiptFooter = Regex(
        "^(?:Tổng\\s*m[oóớòôốộơỡ]*n|Tống\\s*ti[eêểề]n|Tổng\\s*cộng|Tổng\\s*ti[eêểề]n|Tạm\\s*tính|Thành\\s*tiền|Thanh\\s*toán|Chiết\\s*khấu|Giảm\\s*gi[aáả])",
        RegexOption.IGNORE_CASE
    )
    private val customerNoteLabel = Regex(
        "^ghi\\s*ch[uúủ](?:\\s*(?:của\\s*)?khách(?:\\s*hàng)?)?\\s*:?\\s*(.*)$",
        RegexOption.IGNORE_CASE
    )
    private val gluedFooterInNote = Regex(
        "\\s*(?:Tổng\\s*m[oóớòôốộơỡ]*n)\\S*",
        RegexOption.IGNORE_CASE
    )

    fun normalize(text: String): String {
        val lines = text
            .lineSequence()
            .map { normalizeFieldSpelling(it.trim()) }
            .filter(String::isNotBlank)
            .toList()
        val output = mutableListOf<String>()
        var index = 0

        while (index < lines.size) {
            val line = lines[index]
            val nextLine = lines.getOrNull(index + 1)
            if (orderLabel.matches(line) && nextLine != null && orderCode.matches(nextLine)) {
                output.add("$line: $nextLine")
                index += 2
                continue
            }

            val itemMatch = numberedItem.matchEntire(line)
            if (itemMatch != null) {
                val itemName = canonicalItemName(itemMatch.groupValues[1].trim())
                val sides = mutableListOf<NormalizedSide>()
                val notes = mutableListOf<String>()
                var quantity = 1
                var rowPrice: String? = null
                var cursor = index + 1

                while (cursor < lines.size) {
                    val detail = lines[cursor]
                    if (numberedItem.matches(detail)) {
                        break
                    }

                    val customerNote = cleanCustomerNote(detail)
                    if (customerNote != null || receiptFooter.containsMatchIn(detail)) {
                        if (!customerNote.isNullOrBlank()) notes.add(customerNote)
                        var scan = cursor + 1
                        while (scan < lines.size && !numberedItem.matches(lines[scan])) {
                            val laterNote = cleanCustomerNote(lines[scan])
                            if (!laterNote.isNullOrBlank()) notes.add(laterNote)
                            scan += 1
                        }
                        break
                    }

                    val sideMatch = sideLine.matchEntire(detail)
                    val priceMatch = detachedPrice.matchEntire(detail)
                    val barePriceMatch = bareDetachedPrice.matchEntire(detail)
                    when {
                        sideMatch != null -> {
                            val rawSide = sideMatch.groupValues[1].trim()
                            val quantityMatch = sideQuantity.matchEntire(rawSide)
                            sides.add(
                                NormalizedSide(
                                    name = quantityMatch?.groupValues?.get(2)?.trim() ?: rawSide,
                                    quantity = quantityMatch?.groupValues?.get(1)?.toIntOrNull() ?: 1
                                )
                            )
                        }
                        priceMatch != null -> {
                            quantity = priceMatch.groupValues[1]
                                .ifBlank { priceMatch.groupValues[2] }
                                .toIntOrNull() ?: 1
                            rowPrice = priceMatch.groupValues[3]
                        }
                        barePriceMatch != null -> {
                            rowPrice = barePriceMatch.groupValues[1]
                        }
                        else -> notes.add(detail)
                    }
                    cursor += 1
                }

                if (rowPrice != null) {
                    val standaloneSoups = sides.mapNotNull { side ->
                        canonicalStandaloneSoup(side.name)?.let { canonicalName ->
                            NormalizedSide(canonicalName, side.quantity)
                        }
                    }
                    val regularSides = sides.filter { canonicalStandaloneSoup(it.name) == null }
                    val itemNotes = notes.toMutableList()

                    output.add("${quantity}x $itemName $rowPrice")
                    output.addAll(regularSides.map { side ->
                        val prefix = if (side.quantity > 1) "${side.quantity}x " else ""
                        "+ $prefix${side.name}"
                    })
                    if (itemNotes.isNotEmpty()) {
                        output.add("Ghi chú: ${itemNotes.joinToString(" ")}")
                    }
                    // The current relay parser needs a positive numeric token to
                    // recognize an item line. create_order ignores this sentinel
                    // and resolves the authoritative POS price from the menu.
                    output.addAll(standaloneSoups.map { soup ->
                        "${quantity * soup.quantity}x ${soup.name} 1"
                    })
                    index = if (
                        cursor < lines.size && cleanCustomerNote(lines[cursor]) != null
                    ) {
                        cursor + 1
                    } else {
                        cursor
                    }
                    continue
                }
            }

            output.add(line)
            index += 1
        }

        return output.joinToString("\n")
    }

    private fun cleanCustomerNote(line: String): String? {
        val captured = customerNoteLabel.find(line)?.groupValues?.get(1) ?: return null
        return captured
            .replace(gluedFooterInNote, "")
            .replace(Regex("cà\\s*chu\\s+a", RegexOption.IGNORE_CASE), "cà chua")
            .trim()
    }

    private fun normalizeFieldSpelling(line: String): String = line
        .replace(Regex("^M[āa]\\s*đơn", RegexOption.IGNORE_CASE)) { match ->
            if (match.value.firstOrNull()?.isUpperCase() == true) "Mã đơn" else "mã đơn"
        }
        .replace(Regex("\\bCdm\\b", RegexOption.IGNORE_CASE)) { match ->
            if (match.value.firstOrNull()?.isUpperCase() == true) "Cơm" else "cơm"
        }
        .replace(Regex("\\bCơmn\\b", RegexOption.IGNORE_CASE)) { match ->
            if (match.value.firstOrNull()?.isUpperCase() == true) "Cơm" else "cơm"
        }
        .replace(Regex("\\bti[ểễ]n\\b", RegexOption.IGNORE_CASE)) { match ->
            if (match.value.firstOrNull()?.isUpperCase() == true) "Tiền" else "tiền"
        }

    private fun canonicalItemName(name: String): String {
        val normalized = name
            .lowercase()
            .replace('đ', 'd')
            .normalizeVietnamese()
        return itemNameAliases[normalized] ?: name
    }

    private fun canonicalStandaloneSoup(name: String): String? {
        val normalized = name
            .lowercase()
            .replace('đ', 'd')
            .normalizeVietnamese()
        return standaloneSoupAliases[normalized]
    }

    private fun String.normalizeVietnamese(): String = java.text.Normalizer
        .normalize(this, java.text.Normalizer.Form.NFD)
        .replace(Regex("\\p{Mn}+"), "")
        .trim()
}
