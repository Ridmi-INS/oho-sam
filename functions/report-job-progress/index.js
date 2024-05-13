const { randomUUID } = require('crypto');
const db = require("./services/db");
const logger = require('./services/logger');

const PURGE_TIMEOUT = 14; // 14 days

// Lambda handler
exports.handler = async (event) => {
  const logMeta = `Client: ${event.client_id} Batch ID: ${event.batch.id} Process: ${process.env.AWS_LAMBDA_FUNCTION_NAME}`;
  try {
    // start db connection
    await db.createConnection();

    let currentDate = new Date();
    const createdAt = currentDate.toISOString().slice(0, 19).replace("T", " ");
    currentDate.setDate(currentDate.getDate() + PURGE_TIMEOUT);
    const purgeAt = currentDate.toISOString().slice(0, 19).replace("T", " ");
    const recordID = randomUUID();

    const jobRecord = {
      id: recordID,
      client_id: event.client_id,
      batch_id: event.batch.id,
      job_id: event.job.id,
      job_index: event.job.start_index,
      total_jobs: event.batch.number_of_jobs,
      status: event.state,
      batch_type: event.meta.available,
      created_at: createdAt,
      purge_at: purgeAt,
    };
    logger.trace(
      `${logMeta} Job ID: ${event.job.id} : Created db object: ${JSON.stringify(jobRecord)}`
    );

    const insertQuery = `INSERT INTO api_poller_job (
                              id, 
                              client_id, 
                              batch_id,
                              job_id,
                              job_index, 
                              total_jobs, 
                              status,
                              created_at,
                              purge_at) 
                              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`;

    const values = [
      jobRecord.id,
      jobRecord.client_id,
      jobRecord.batch_id,
      jobRecord.job_id,
      jobRecord.job_index,
      jobRecord.total_jobs,
      jobRecord.status,
      jobRecord.created_at,
      jobRecord.purge_at,
    ];

    // Create schema for batch table
    logger.debug(`${logMeta} Job ID: ${event.job.id} : Start query: ${insertQuery}`);
    const result = await db.query(insertQuery, values);
    logger.trace(
      `${logMeta} : Job ID: ${event.job.id} : Query: ${insertQuery} Success, Result: ${result}`
    );

    return {
      statusCode: 200,
      body: event,
    };
  } catch (error) {
    logger.error(`${logMeta} : Job ID: ${event.job.id} : Error: ${error}`);
    return error;
  } finally {
    // close connection
    await db.closeConnection();
  }
};
