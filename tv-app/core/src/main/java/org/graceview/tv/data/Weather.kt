package org.graceview.tv.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import org.graceview.tv.Config
import kotlin.math.roundToInt

data class Weather(val tempF: Int, val code: Int, val isDay: Boolean)

@Serializable
private data class OmCurrent(
    @SerialName("temperature_2m") val temp: Double,
    @SerialName("weather_code") val code: Int,
    @SerialName("is_day") val isDay: Int = 1,
)

@Serializable
private data class OmResponse(val current: OmCurrent)

/** Open-Meteo, no key needed. */
object WeatherRepo {
    suspend fun fetch(): Weather {
        val url = "https://api.open-meteo.com/v1/forecast" +
            "?latitude=${Config.WEATHER_LAT}&longitude=${Config.WEATHER_LON}" +
            "&current=temperature_2m,weather_code,is_day&temperature_unit=fahrenheit" +
            "&timezone=" + Net.enc(Config.ZONE.id)
        val c = Net.json.decodeFromString<OmResponse>(Net.getString(url)).current
        return Weather(c.temp.roundToInt(), c.code, c.isDay == 1)
    }
}
