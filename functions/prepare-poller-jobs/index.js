const { randomUUID } = require('crypto');
const _ = require('lodash');
const logger = require('./services/logger');
// const adapter = require(`./types/rest`);

const RADIX_DECIMAL = 10;

exports.handler = async (event) => {
  const batchID = randomUUID();
  const logMeta = `Client: ${event.client_id} Batch ID: ${batchID}`;

  try {
    logger.info(`${logMeta}: starting API poller state machine`);
    logger.debug(`${logMeta}: event: ${JSON.stringify(event)}`);

    // Load the correct module
    const adapter = require(`./types/${event?.healthcheck?.fetch_type}`);

    // Do a health check on the data URL (set up a definite healthcheck url)
    const healthcheckResult = await adapter.healthCheck(event, logMeta);
    logger.debug(`${logMeta}: event: ${JSON.stringify(healthcheckResult)}`);

    // Check meta data availability
    const result = await adapter.getMetaData(event, logMeta);
    logger.debug(`${logMeta}: event: ${JSON.stringify(result)}`);

    let totalRecordSize = -1; // Total amount of records

    if (result && result.status === 200) {
      totalRecordSize = parseInt(
        _.get(result.data, event?.meta?.record_size_json_path),
        RADIX_DECIMAL,
      );
    }

    event.meta.records_size = totalRecordSize;

    event.meta.records_size = parseInt(event.meta.records_size, RADIX_DECIMAL);

    let tasks = [];

    // Set the purge Time Stamp for 2 weeks
    const currentDate = new Date();
    currentDate.setDate(currentDate.getDate() + 14);
    const purgeTimeStamp = currentDate;

    // Create execution object
    const executionInfo = {
      client_id: event.client_id,
      workflow: 'poller',
      execution_name: '1',
      execution_id: randomUUID(),
      status: 'started',
      last_update_ts: new Date().toISOString(),
    };

    logger.debug(`${logMeta} Execution info: ${JSON.stringify(executionInfo)}`);

    if (totalRecordSize > 0) {
      // Create list of tasks if records total is known
      const totalJobs = Math.ceil(totalRecordSize / event?.data?.max_page_size);
      tasks = Array.from({ length: totalJobs }, (_a, i) => ({
        ...event,
        batch: {
          id: batchID,
          number_of_jobs: totalJobs,
          purge_timestamp: purgeTimeStamp,
        },
        job: { id: '', start_index: i + 1 },
        state: 'onBatchCreated',
        runs: executionInfo,
      }));
      logger.debug(`${logMeta}: Total records or hint available, created jobs: ${totalJobs}`);
    } else {
      // Create a list of one if total records unknown
      tasks = [{
        ...event,
        batch: {
          id: batchID,
          number_of_jobs: 1,
          purge_timestamp: purgeTimeStamp,
        },
        job: { id: '', start_index: 1 },
        state: 'onBatchCreated',
        runs: executionInfo,
      }];

      logger.debug(`${logMeta}: Total records or hint not available, created 1 job`);
    }

    const body = { tasks };

    const response = {
      statusCode: 200,
      body,
    };
    return response;
  } catch (error) {
    logger.error(`${logMeta}: Error occured: ${error}`);
    throw error;
  }
};
