# Open-Meteo fixture

`forecast.json`: one real response from the Open-Meteo forecast API for Los Angeles City Hall (public landmark, not a user location).

- fetched at (epoch ms): 1791340007841
- command: `curl -s "https://api.open-meteo.com/v1/forecast?latitude=34.05&longitude=-118.24&hourly=temperature_2m,cloud_cover,shortwave_radiation,precipitation,precipitation_probability&past_days=1&forecast_days=3&timezone=UTC&timeformat=unixtime" -o fixtures/open-meteo/forecast.json`
- 96 hourly rows, `hourly.time` in unix seconds. `shortwave_radiation` at T is the mean of the preceding hour.
