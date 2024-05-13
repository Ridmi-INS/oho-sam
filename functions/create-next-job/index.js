const logger = require('./services/logger');

exports.handler = async (event, context) => {
    try {
        // Check if total records are not known
        const logMeta = `Client: ${event.client_id} Batch ID: ${event.batch.id} Job ID: ${event.job.id}  Process: ${process.env.AWS_LAMBDA_FUNCTION_NAME}`;
        logger.debug(`${logMeta}: Starting Create Next Job for job: ${event.job.id}`);
        logger.trace(`${logMeta}: Event: ${JSON.stringify(event)}`);

        let task = event;
        if (event.meta.available) { // meta available
            logger.debug(`${logMeta}: all payloads fetched`);
            task.state = "onFetchedAllPayloads";
        } else { // hint available
            if (event.job.records_size < event.meta.prefer_page_size) { // partially filled request case
                logger.info(`${logMeta}: last request is partially full, ending the retrieve payload loop`);
                task.state = "onEmptyLastRequest";
            } else if (event.job.records_size == event.meta.prefer_page_size) { // fully filled request case
                if (event.job.start_index >= event.batch.number_of_jobs) { // fully filled last request
                    task.job.start_index += 1;
                    task.state = "onFilledLastRequest";
                    logger.debug(`${logMeta}: incrementing to retrieve next page: ${task.job.start_index}`);
                } else { // fully filled prior to last requests
                    logger.info(`${logMeta}: fetched all payloads`);
                    task.state = "onFetchedAllPayloads";
                }
            } else { // API does not comform to the pattern
                logger.error(`${logMeta}: invalid records size`);
                task.state = "Failed";
            }
        }
        logger.trace(task);
        const response = {
            statusCode: 200,
            body: task,
        };
        return response;
    } catch (error) {
        logger.error(`Error: ${error}`);
        return error;
    }
};
