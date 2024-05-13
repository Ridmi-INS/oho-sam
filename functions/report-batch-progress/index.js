const { randomUUID } = require('crypto');
const db = require("./services/db");
const logger = require('./services/logger');

const PURGE_TIMEOUT = 14; // 14 days

const executionStatusTypes = {
  started: "started",
  completed: "completed",
  unknown: "unknown"
}

// Lambda handler
exports.handler = async event => {
  const eventLast = event[event.length - 1];
  const logMeta = `Client: ${eventLast.client_id} Batch ID: ${eventLast.batch.id} Process: ${process.env.AWS_LAMBDA_FUNCTION_NAME}`;
  try {
    // Create db connection
    await db.createConnection();

    let currentDate = new Date();
    const createdAt = currentDate.toISOString().slice(0, 19).replace('T', ' ');
    currentDate.setDate(currentDate.getDate() + PURGE_TIMEOUT);
    const purgeAt = currentDate.toISOString().slice(0, 19).replace('T', ' ');
    const recordID = randomUUID();

    logger.trace(`${logMeta} : ${JSON.stringify(event)}`);
    const batch = {
      id: recordID,
      client_id: eventLast.client_id,
      batch_id: eventLast.batch.id,
      total_jobs: eventLast.batch.number_of_jobs,
      status: eventLast.state,
      batch_type: eventLast.meta.available,
      created_at: createdAt,
      purge_at: purgeAt 
    };

    logger.trace(`${logMeta} : Created batch db object ${JSON.stringify(batch)}`);

    const insertQuery = `INSERT INTO api_poller_batch (
                              id, 
                              client_id, 
                              batch_id, 
                              total_jobs, 
                              status, 
                              batch_type, 
                              created_at,
                              purge_at) 
                              VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`;
    const values = [
      batch.id,
      batch.client_id,
      batch.batch_id,
      batch.total_jobs,
      batch.status,
      batch.batch_type,
      batch.created_at,
      batch.purge_at
    ];

    // Create start entry for batch table
    logger.debug(`${logMeta} : Start query ${insertQuery}`);
    const result = await db.query(insertQuery, values);
    logger.trace(`${logMeta} : Query: ${insertQuery} Success, Result: ${result}`);

    // Add execution information record
    if (eventLast?.runs) {
      let execInfo = eventLast.runs;
      let executionStatus = null;
      if (batch.status == "onBatchCreated") {
        // Workflow start
        executionStatus = executionStatusTypes.started;
      } else if (batch.status == "onEmptyLastRequest" || batch.status == "onFetchedAllPayloads") {
        // Workflow end
        executionStatus = executionStatusTypes.completed;
      } else {
        executionStatus = executionStatusTypes.unknown;
      }

      // Update run record
      const workflowUpdateQuery = `INSERT INTO workflow_executions (
                                      id,
                                      client_id,
                                      workflow,
                                      execution_name,
                                      execution_id,
                                      status,
                                      last_update_ts)
                                      VALUES ($1, $2, $3, $4, $5, $6, $7)`;
      const workflowUpdateValues = [
        randomUUID(),
        execInfo.client_id,
        execInfo.workflow,
        execInfo.execution_name,
        execInfo.execution_id,
        executionStatus,
        execInfo.last_update_ts];

      logger.debug(`${logMeta} : Start query ${workflowUpdateQuery}`);
      const result = await db.query(workflowUpdateQuery, workflowUpdateValues);
      logger.trace(`${logMeta} : Query: ${workflowUpdateQuery} Success, Result: ${result}`);
    }

    logger.debug(`${logMeta} lastEdit flag on input: ${eventLast.data?.query?.lastEdit}`);

    // Allows to override lastEdit
    const allowLastEdit = (String(eventLast?.data?.allow_last_edit).toLowerCase() === "true");
    logger.debug(`${logMeta} allow last edit: ${allowLastEdit}`);

    // Update last edit if exists on data on start of the workflow
    if (allowLastEdit) {
      if (batch.status == "onBatchCreated" && !eventLast.data?.query?.lastEdit) {
        const workflowSelectQuery = `SELECT max(last_update_ts) FROM workflow_executions WHERE status=$1 AND workflow=$2 AND client_id=$3`;
        const workflowSelectQueryValues = [executionStatusTypes.completed, "poller", batch.client_id];

        logger.debug(`${logMeta} : Start query ${workflowSelectQuery}`);
        const result = await db.query(workflowSelectQuery, workflowSelectQueryValues);
        logger.trace(`${logMeta} : Query: ${workflowSelectQuery} Success, Result: ${result}`);

        let lastPollerRun = null;
        // If the poller run details are available
        if (result.rows.length > 0) {
          lastPollerRun = result.rows[0].max;
          logger.debug(`${logMeta} last successful run: ${lastPollerRun}`);
          logger.debug(`${logMeta} updating the lastEdit of the events`);
          // Update the last edit of all map objects
          for (let each of event) {
            each.data.query.lastEdit = lastPollerRun;
          }
        }
      }
    } else {
      // Set the last edit to null for fetch payload
      for (let each of event) {
        each.data.query.lastEdit = null;
      }
    }


    return {
        statusCode: 200,
        body: event
    };
  } catch (error) {
    logger.error(`${logMeta} : Error: ${error}`);
    throw error;
  } finally {
    // Close connection at the end
    await db.closeConnection();
  }
};
