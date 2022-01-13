const functions = require("firebase-functions");
const admin = require("firebase-admin");
const csv = require("csv-parser");
const fetch = require("node-fetch");
const {parseISO, isAfter} = require("date-fns");

admin.initializeApp();
const bucketName = "gs://covid-data-quebec.appspot.com";

const columns = {
  DATE: "Date",
  AGE: "GrAge_Admission",
  VAX_STATUS: "Statut_Vaccinal",
  HOSPITALISATIONS: "Nb_Nvelles_Hosp",
};

const AGES = [
  "0-9 ans",
  "10-19 ans",
  "20-29 ans",
  "30-39 ans",
  "40-49 ans",
  "50-59 ans",
  "60-69 ans",
  "70-79 ans",
  "80-89 ans",
  "90 ans et plus",
];

const VAX_STATUS = [
  "Non-vacciné",
  "Vacciné 1 dose",
  "Vacciné 2 doses",
  "Total",
];

const DATES = [];
const MAP = {};
const TOTAL_MAP = {};
const OUTPUT = [];

const processDataPerDate = (data) => {
  const num = parseInt(data[columns.HOSPITALISATIONS]);
  MAP[data[columns.DATE]] = MAP[data[columns.DATE]] || {};
  MAP[data[columns.DATE]]["Total"] = MAP[data[columns.DATE]]["Total"] || {};
  MAP[data[columns.DATE]]["Total"]["Total"] =
    MAP[data[columns.DATE]]["Total"]["Total"] || 0;
  MAP[data[columns.DATE]]["Total"]["Total"] =
    MAP[data[columns.DATE]]["Total"]["Total"] + num;
  MAP[data[columns.DATE]]["Total"][data[columns.AGE]] =
    MAP[data[columns.DATE]]["Total"][data[columns.AGE]] || 0;
  MAP[data[columns.DATE]]["Total"][data[columns.AGE]] =
    MAP[data[columns.DATE]]["Total"][data[columns.AGE]] + num;
  MAP[data[columns.DATE]][data[columns.VAX_STATUS]] =
    MAP[data[columns.DATE]][data[columns.VAX_STATUS]] || {};
  MAP[data[columns.DATE]][data[columns.VAX_STATUS]]["Total"] =
    MAP[data[columns.DATE]][data[columns.VAX_STATUS]]["Total"] || 0;
  MAP[data[columns.DATE]][data[columns.VAX_STATUS]]["Total"] =
    MAP[data[columns.DATE]][data[columns.VAX_STATUS]]["Total"] + num;
  MAP[data[columns.DATE]][data[columns.VAX_STATUS]][data[columns.AGE]] =
    MAP[data[columns.DATE]][data[columns.VAX_STATUS]][data[columns.AGE]] || 0;
  MAP[data[columns.DATE]][data[columns.VAX_STATUS]][data[columns.AGE]] =
    MAP[data[columns.DATE]][data[columns.VAX_STATUS]][data[columns.AGE]] + num;

  TOTAL_MAP["Total"] = TOTAL_MAP["Total"] || 0;
  TOTAL_MAP["Total"] = TOTAL_MAP["Total"] + num;
  TOTAL_MAP[data[columns.VAX_STATUS]] =
    TOTAL_MAP[data[columns.VAX_STATUS]] || {};
  TOTAL_MAP[data[columns.VAX_STATUS]]["Total"] =
    TOTAL_MAP[data[columns.VAX_STATUS]]["Total"] || 0;
  TOTAL_MAP[data[columns.VAX_STATUS]]["Total"] =
    TOTAL_MAP[data[columns.VAX_STATUS]]["Total"] + num;
  TOTAL_MAP[data[columns.VAX_STATUS]][data[columns.AGE]] =
    TOTAL_MAP[data[columns.VAX_STATUS]][data[columns.AGE]] || 0;
  TOTAL_MAP[data[columns.VAX_STATUS]][data[columns.AGE]] =
    TOTAL_MAP[data[columns.VAX_STATUS]][data[columns.AGE]] + num;
};

exports.scheduledFunction = functions.region("northamerica-northeast1").pubsub
    .schedule("0 7,8,10,12,14,16,18,21 * * *")
    .onRun(async () => {
      try {
        console.log("This will run at 4pm every day");
        const response = await fetch(
            "https://msss.gouv.qc.ca/professionnels/statistiques/documents/covid19/COVID19_Qc_RapportINSPQ_HospitalisationsSelonStatutVaccinalEtAge.csv",
        );
        const promise = new Promise((resolve, reject) => {
          response.body
              .pipe(
                  csv({
                    mapHeaders: ({header}) => header.trim(),
                  }),
              )
              .on("data", (data) => {
                try {
                  const potentialDate = data[columns.DATE];
                  const timestamp = parseISO(potentialDate);
                  // const firstDate = parseISO('2021-11-30')
                  const firstDate = parseISO("2011-11-30");
                  const includeDate = isAfter(timestamp, firstDate);
                  if (includeDate) {
                    if (!MAP[data[columns.DATE]]) {
                      DATES.push(data[columns.DATE]);
                    }
                    processDataPerDate(data);
                  }
                } catch (err) {
                  console.log("ERR: ", err);
                  reject(err);
                }
              })
              .on("end", async () => {
                console.log("END");
                const periodName = `Période du ${DATES[0]} au ${DATES.slice(-1)[0]}`;
                MAP[periodName] = TOTAL_MAP;
                DATES.push(periodName);
                for (const date of DATES) {
                  const dataPerDate = MAP[date];
                  for (const status of VAX_STATUS) {
                    const percent = `${(
                      (dataPerDate[status].Total / dataPerDate.Total.Total) *
                100
                    ).toFixed(2)}%`;
                    dataPerDate[status]["Total %"] = percent;
                    for (const age of AGES) {
                      const percent = `${(
                        (dataPerDate[status][age] / dataPerDate.Total.Total) *
                  100
                      ).toFixed(2)}%`;
                      dataPerDate[status][`${age} %`] = percent;
                    }
                  }

                  OUTPUT.push({
                    Date: date,
                    ...dataPerDate,
                  });
                }

                const covidData = JSON.stringify({
                  list: OUTPUT,
                  map: MAP,
                });

                const newJsonBucket = admin.storage().bucket(bucketName);
                console.log("ADDING TO STORAGE");
                await newJsonBucket.file("covid-data.json").save(covidData);
                console.log("SUCCESSFULLY ADDED TO STORAGE");
                resolve();
              });
        });

        await promise;

        return null;
      } catch (err) {
        console.log("ERR: ", err);
        throw err;
      }
    });
