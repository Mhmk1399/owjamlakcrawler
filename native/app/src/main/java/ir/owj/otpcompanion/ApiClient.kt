package ir.owj.otpcompanion

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

data class ApiResponse(val status: Int, val json: JSONObject)

class ApiClient(private val baseUrl: String) {
    fun request(
        method: String,
        path: String,
        bearerToken: String? = null,
        headers: Map<String, String> = emptyMap(),
        body: JSONObject? = null,
    ): ApiResponse {
        val connection = URL(baseUrl.trimEnd('/') + path).openConnection() as HttpURLConnection
        connection.requestMethod = method
        connection.connectTimeout = 10_000
        connection.readTimeout = 20_000
        connection.setRequestProperty("Accept", "application/json")
        if (!bearerToken.isNullOrBlank()) {
            connection.setRequestProperty("Authorization", "Bearer $bearerToken")
        }
        headers.forEach(connection::setRequestProperty)
        if (body != null) {
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
        }
        val status = connection.responseCode
        val stream = if (status in 200..299) connection.inputStream else connection.errorStream
        val text = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
        val result = if (text.isBlank()) JSONObject() else JSONObject(text)
        connection.disconnect()
        if (status !in 200..299) {
            throw ApiException(status, result.optString("error", "HTTP $status"))
        }
        return ApiResponse(status, result)
    }
}

class ApiException(val status: Int, message: String) : Exception(message)
