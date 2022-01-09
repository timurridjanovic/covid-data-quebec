import React, { useEffect, useState } from 'react'
import Radium, { StyleRoot } from 'radium'
import Highcharts from 'highcharts'
import HighchartsReact from 'highcharts-react-official'
import DatePicker from 'react-datepicker'
import { ref, getDownloadURL } from 'firebase/storage'
import firebase from '../services/firebase';
import { parseISO, format, isWithinInterval } from 'date-fns'

const styles = {
  container: {
    fontFamily: '"Lucida Grande", "Lucida Sans Unicode", Arial, Helvetica, sans-serif',
    color: '#333333'
  },
  header: {
    backgroundColor: '#f6a35c',
    height: '4em',
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    padding: '5px 2em'
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: '#fff'
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#fff',
    fontWeight: 500,
    marginTop: 5
  },
  bodyContainer: {
    margin: '20px 0',
    padding: '0 2em'
  },
  notes: {
    fontSize: 12
  },
  datePickerHeader: {
    marginTop: 40,
    fontSize: 16,
  },
  datePickerContainer: {
    marginTop: 20
  },
  checkbox: {
    verticalAlign: 'middle'
  },
  loaderContainer: {
    width: '50%',
    margin: '0 auto'
  },
  loader: {
    width: '100%'
  },
}

const keys = [
  'Non-vacciné',
  'Vacciné 1 dose',
  'Vacciné 2 doses',
  'Total'
]

const subkeys = [
  '0-9 ans',
  '10-19 ans',
  '20-29 ans',
  '30-39 ans',
  '40-49 ans',
  '50-59 ans',
  '60-69 ans',
  '70-79 ans',
  '80-89 ans',
  '90 ans et plus',
  'Total'
]

const Wrapper = () => {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)
  const [dates, setDates] = useState(null)
  const [checked, setChecked] = useState(false)
  const [selectedDate, setSelectedDate] = useState(null)
  const [selectedDateTimestamp, setSelectedDateTimestamp] = useState(null)
  const [startDate, setStartDate] = useState(null)
  const [endDate, setEndDate] = useState(null)
  const [selectedDateData, setSelectedDateData] = useState(null)
  const [excludedDates, setExcludedDates] = useState([])
  const [chartOptions, setChartOptions] = useState(null)

  const constructOptionsForCharts = map => {
    const series = subkeys.map(name => {
      const data = keys.map(key => {
        return selectedDateData[key][name]
      })
      return {
        name,
        data
      }
    })

    const options = {
      credits: {
        enabled: false
      },
      chart: {
        type: "column",
      },
      title: {
        text: 'Hospitalisations covid-19 par âge et par statut vaccinal',
      },
      subtitle: {
        text: selectedDate,
      },
      xAxis: {
        categories: keys,
        crosshair: true,
      },
      yAxis: {
        min: 0,
        title: {
          text: 'Nombre d\'hospitalisations',
        },
      },
      tooltip: {
        formatter: function() {
          return `<table>
            <span style="font-size:10px">${this.x}</span><table>
            ${this.points.map((e, i) => `<tr><td style="color:${this.points[i].series.color};padding:0">${this.points[i].series.name}: </td>
            <td style="padding:0"><b>${this.points[i].point.y} (${map[this.x][`${this.points[i].series.name} %`]})</b></td></tr>`).join('')}
          </table>`
        },
        shared: true,
        useHTML: true,
      },
      plotOptions: {
        column: {
          pointPadding: 0.2,
          borderWidth: 0,
        },
      },
      series
    }

    return options
  }

  useEffect(() => {
    getDownloadURL(ref(firebase, 'covid-data.json')).then(url => {
      fetch(url).then(res => res.json()).then(json => {
        setData(json)
        const firstDate = parseISO(json.list[0].Date)
        const selectedDateStr = json.list.slice(-2)[0].Date
        const lastDate = parseISO(selectedDateStr)
        const selectedDateObj = json.map[selectedDateStr]
        setSelectedDateTimestamp(lastDate)
        setStartDate(lastDate)
        setSelectedDateData(selectedDateObj)
        setSelectedDate(selectedDateStr)
        setDates([firstDate, lastDate])
        setLoading(false)
      })
    })
  }, [])

  useEffect(() => {
    if (selectedDate) {
      const options = constructOptionsForCharts(selectedDateData, selectedDate)
      setChartOptions(options)
    }
  }, [selectedDate, checked])

  const onSetSelectedDate = dates => {
    if (checked) {
      const [start, end] = dates;
      setStartDate(start)
      setEndDate(end)
      if (start && end) {
        const startDateStr = format(start, 'yyyy-MM-dd')
        const endDateStr = format(end, 'yyyy-MM-dd')

        const newSelectedDate = `Période du ${startDateStr} au ${endDateStr}`
        const newMap = {
          Date: newSelectedDate
        }
        for (const date of data.list) {
          const dateIso = date.Date
          const parsedDate = parseISO(dateIso)
          if (isWithinInterval(parsedDate, { start, end })) {
            Object.keys(date).forEach(key => {
              if (key !== 'Date') {
                subkeys.forEach(subkey => {
                  const num = date[key][subkey]
                  newMap[key] = newMap[key] || {}
                  newMap[key][subkey] = newMap[key][subkey] || 0
                  newMap[key][subkey] = newMap[key][subkey] + num
                })
              }
            })
          }
        }

        if (Object.keys(newMap).length <= 1) {
          alert('Cette plage de données ne donne aucun résultat. Veuillez essayer autre chose.')
        } else {
          for (const key of keys) {
            for (const subkey of subkeys) {
              const num = newMap[key][subkey]
              const percent = `${((num/newMap['Total'].Total) * 100).toFixed(2)}%`
              newMap[key][`${subkey} %`] = percent
            }
          }

          setSelectedDateData(newMap)
          setSelectedDate(newSelectedDate)
        }
      }
    } else {
      const date = dates
      const selectedDateStr = format(date, 'yyyy-MM-dd')
      const selectedDateObj = data.map[selectedDateStr]
      if (!selectedDateObj) {
        setExcludedDates(prev => [...prev, date])
        alert('Cette date n\'est malheureusement pas disponible dans les données.')
      } else {
        setSelectedDate(selectedDateStr)
        setSelectedDateTimestamp(date)
        setStartDate(null)
        setEndDate(null)
        setSelectedDateData(selectedDateObj)
      }
    }
  }

  const onCheckboxChange = () => {
    if (checked) {
      const newSelectedDate = format(selectedDateTimestamp, 'yyyy-MM-dd')
      setSelectedDate(newSelectedDate)
      const selectedDateObj = data.map[newSelectedDate]
      setSelectedDateTimestamp(startDate)
      setStartDate(null)
      setEndDate(null)
      setSelectedDateData(selectedDateObj)
    } else {
    }
    setChecked(prev => !prev)
  }
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.headerTitle}>
          Timur Ridjanovic
          <div style={styles.headerSubtitle}>
            Visualisation de données: hospitalisations dues à la Covid-19 au Québec (2021-2022)
          </div>
        </div>
      </div>
      <div style={styles.bodyContainer}>
        <div style={styles.notes}>
          Notes: ces données ont été récoltées sur le site de&#160;
          <a href="https://www.donneesquebec.ca/recherche/dataset/covid-19-portrait-quotidien-des-hospitalisations" target="_blank">Partenariat Données Québec</a>
        </div>
        {loading && (
          <div style={styles.loaderContainer}>
            <img style={styles.loader} src="https://miro.medium.com/max/1400/1*CsJ05WEGfunYMLGfsT2sXA.gif" />
          </div>
        )}
        {!loading && (
          <>
            <div style={styles.datePickerHeader}>
              <label>Sélectionnez une plage de dates <input checked={checked} onChange={onCheckboxChange} style={styles.checkbox} type="checkbox" /></label>
            </div>
            <div style={styles.datePickerContainer}>
              {!checked && (
                <DatePicker
                  minDate={dates[0]}
                  maxDate={dates[1]}
                  selected={selectedDateTimestamp}
                  onChange={(date) => onSetSelectedDate(date)}
                  excludeDates={excludedDates}
                />
              )}
              {checked && (
                <DatePicker
                  minDate={dates[0]}
                  maxDate={dates[1]}
                  selected={selectedDateTimestamp}
                  onChange={(date) => onSetSelectedDate(date)}
                  startDate={startDate}
                  endDate={endDate}
                  selectsRange
                />
              )}
            </div>
            <HighchartsReact
              highcharts={Highcharts}
              options={chartOptions}
            />
          </>
        )}
      </div>
    </div>
  )
}

const Home = () => {
  return (
    <StyleRoot>
      <Wrapper />
    </StyleRoot>
  )
}

export default Radium(Home)