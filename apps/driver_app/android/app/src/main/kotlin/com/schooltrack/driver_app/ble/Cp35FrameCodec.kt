package com.schooltrack.driver_app.ble

/**
 * CP35 framed command codec: `4E 4F | cmd | len | payload | xor`
 * (xor over cmd + len + payload). Derived from vendor GATT / demo protocol.
 */
object Cp35FrameCodec {
    const val HEAD0: Byte = 0x4E
    const val HEAD1: Byte = 0x4F

    fun pack(cmd: Byte, payload: ByteArray? = null): ByteArray {
        val data = payload ?: ByteArray(0)
        require(data.size <= 255) { "payload too long" }
        val out = ByteArray(data.size + 5)
        var index = 0
        out[index++] = HEAD0
        out[index++] = HEAD1
        out[index++] = cmd
        out[index++] = data.size.toByte()
        var xor = (cmd.toInt() xor data.size).toByte()
        for (b in data) {
            out[index++] = b
            xor = (xor.toInt() xor b.toInt()).toByte()
        }
        out[index] = xor
        return out
    }

    fun check(frame: ByteArray, length: Int = frame.size): Boolean {
        if (length < 5) return false
        if (frame[0] != HEAD0 || frame[1] != HEAD1) return false
        val payloadLen = frame[3].toInt() and 0xFF
        if (length != payloadLen + 5) return false
        var xor = frame[2]
        xor = (xor.toInt() xor frame[3].toInt()).toByte()
        for (i in 0 until payloadLen) {
            xor = (xor.toInt() xor frame[4 + i].toInt()).toByte()
        }
        return xor == frame[length - 1]
    }

    /** Strip NO framing; returns cmd + payload (without xor) or null if invalid. */
    fun unwrap(frame: ByteArray): Pair<Byte, ByteArray>? {
        if (!check(frame)) return null
        val len = frame[3].toInt() and 0xFF
        val payload = if (len == 0) ByteArray(0) else frame.copyOfRange(4, 4 + len)
        return frame[2] to payload
    }
}
