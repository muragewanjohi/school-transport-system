package com.schooltrack.driver_app.ble

import java.nio.charset.StandardCharsets
import java.util.Locale
import java.util.UUID

/**
 * CP35 command builders for OnTheBus provision ops.
 *
 * Wire TX index 0..7 maps DX-SMART labels:
 * 0=-19.5, 1=-13.5, 2=-7, 3=-3.5, 4=-1, 5=+1, 6=+1.5, 7=+2.5 dBm
 * Advertise interval wire value = round(ms / 100), clamped 1..15 (100–1500 ms).
 */
object Cp35Commands {
    val CMD_SET_IBEACON_UUID: Byte = 0x74
    val CMD_SET_IBEACON_MAJOR: Byte = 0x75
    val CMD_SET_IBEACON_MINOR: Byte = 0x76
    val CMD_SET_IBEACON_INTERVAL: Byte = 0x78
    val CMD_SET_IBEACON_TX: Byte = 0x79
    val CMD_SET_TLM_INTERVAL: Byte = 0x91.toByte()
    val CMD_SET_TLM_TX: Byte = 0x92.toByte()
    val CMD_SET_PASSWORD: Byte = 0x24
    val CMD_SAVE_CONFIG: Byte = 0x60
    val CMD_RESTART: Byte = 0x44
    val CMD_TRIGGER_OFF: Byte = 0xA0.toByte()

    private val TX_DBM_TABLE = doubleArrayOf(-19.5, -13.5, -7.0, -3.5, -1.0, 1.0, 1.5, 2.5)

    fun txIndexFromDbm(txDbm: Double): Int {
        var best = 0
        var bestDelta = Double.MAX_VALUE
        for (i in TX_DBM_TABLE.indices) {
            val d = kotlin.math.abs(TX_DBM_TABLE[i] - txDbm)
            if (d < bestDelta) {
                bestDelta = d
                best = i
            }
        }
        return best
    }

    fun intervalIndexFromMs(intervalMs: Int): Int {
        val idx = ((intervalMs + 50) / 100).coerceIn(1, 15)
        return idx
    }

    fun uuidToBytes(uuid: String): ByteArray {
        val normalized = uuid.trim().lowercase(Locale.US).replace("-", "")
        require(normalized.length == 32) { "uuid must be 16 bytes hex" }
        val out = ByteArray(16)
        for (i in 0 until 16) {
            out[i] = normalized.substring(i * 2, i * 2 + 2).toInt(16).toByte()
        }
        return out
    }

    fun passwordBytes(password: String): ByteArray {
        require(password.length == 6) { "password must be 6 characters" }
        return password.toByteArray(StandardCharsets.UTF_8)
    }

    fun setIBeaconUuid(uuid: String): ByteArray =
        Cp35FrameCodec.pack(CMD_SET_IBEACON_UUID, uuidToBytes(uuid))

    fun setIBeaconMajor(major: Int): ByteArray {
        require(major in 0..65535)
        return Cp35FrameCodec.pack(
            CMD_SET_IBEACON_MAJOR,
            byteArrayOf(((major shr 8) and 0xFF).toByte(), (major and 0xFF).toByte()),
        )
    }

    fun setIBeaconMinor(minor: Int): ByteArray {
        require(minor in 0..65535)
        return Cp35FrameCodec.pack(
            CMD_SET_IBEACON_MINOR,
            byteArrayOf(((minor shr 8) and 0xFF).toByte(), (minor and 0xFF).toByte()),
        )
    }

    fun setIBeaconIntervalMs(intervalMs: Int): ByteArray =
        Cp35FrameCodec.pack(
            CMD_SET_IBEACON_INTERVAL,
            byteArrayOf(intervalIndexFromMs(intervalMs).toByte()),
        )

    fun setIBeaconTxDbm(txDbm: Double): ByteArray =
        Cp35FrameCodec.pack(
            CMD_SET_IBEACON_TX,
            byteArrayOf(txIndexFromDbm(txDbm).toByte()),
        )

    fun setTlmIntervalMs(intervalMs: Int): ByteArray =
        Cp35FrameCodec.pack(
            CMD_SET_TLM_INTERVAL,
            byteArrayOf(intervalIndexFromMs(intervalMs).toByte()),
        )

    fun setTlmTxDbm(txDbm: Double): ByteArray =
        Cp35FrameCodec.pack(
            CMD_SET_TLM_TX,
            byteArrayOf(txIndexFromDbm(txDbm).toByte()),
        )

    fun setDevicePassword(newPassword: String): ByteArray =
        Cp35FrameCodec.pack(CMD_SET_PASSWORD, passwordBytes(newPassword))

    fun saveConfig(): ByteArray = Cp35FrameCodec.pack(CMD_SAVE_CONFIG, null)

    /** Soft restart after save; payload is current 6-char password bytes. */
    fun restart(password: String): ByteArray =
        Cp35FrameCodec.pack(CMD_RESTART, passwordBytes(password))

    fun triggerOff(): ByteArray = Cp35FrameCodec.pack(CMD_TRIGGER_OFF, null)

    fun writeIBeaconSequence(
        uuid: String,
        major: Int,
        minor: Int,
        txDbm: Double = -19.5,
        intervalMs: Int = 400,
    ): List<ByteArray> = listOf(
        setIBeaconUuid(uuid),
        setIBeaconMajor(major),
        setIBeaconMinor(minor),
        setIBeaconIntervalMs(intervalMs),
        setIBeaconTxDbm(txDbm),
        triggerOff(),
    )

    fun enableTlmSequence(intervalMs: Int = 800, txDbm: Double = -19.5): List<ByteArray> =
        listOf(setTlmIntervalMs(intervalMs), setTlmTxDbm(txDbm))

    fun normalizeUuidString(uuid: String): String {
        val bytes = uuidToBytes(uuid)
        val hex = bytes.joinToString("") { "%02x".format(it) }
        return UUID.fromString(
            "${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-" +
                "${hex.substring(16, 20)}-${hex.substring(20, 32)}",
        ).toString().uppercase(Locale.US)
    }
}
