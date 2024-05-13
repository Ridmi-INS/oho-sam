const axios = require('axios');
const { getParameter } = require('../services/params');
const logger = require('../services/logger');

const getApiKey = async (event, data, logMeta) => {
  let apiKey;
  // Retrive key and secret for the client API
  if (data?.auth_type?.toLowerCase() === 'basic') {
    logger.debug(`${logMeta}: Using basic auth`);
    const key = await getParameter(`oho-${process.env.ENV}-connector-${event.client_id}-api-key`);
    const secret = await getParameter(`oho-${process.env.ENV}-connector-${event.client_id}-api-secret`);
    apiKey = Buffer.from(`${key}:${secret}`).toString('base64');
  } else if (data?.auth_type?.toLowerCase() === 'bearer') {
    logger.debug(`${logMeta}: Using bearer auth`);
    apiKey = await getParameter(`oho-${process.env.ENV}-connector-${event.client_id}-api-key`);
  } else {
    logger.error(`${logMeta}: Authentication type not defined, check input transformer`);
    throw new Error(`Unknown authentication type ${event}`);
  }
  return apiKey;
};

const healthCheck = async (event, logMeta) => {
  try {
    if (!event?.healthcheck?.available) return null;

    const data = event?.healthcheck;
    const apiKey = await getApiKey(event, data, logMeta);

    const config = {
      method: (data?.request_type) ? data.request_type : 'get',
      baseURL: data?.base_url,
      url: data?.path,
      headers: {
        ...data?.headers,
        Authorization: `${data?.auth_type} ${apiKey}`,
      },
      params: data?.query,
      data: (data?.body && data?.body?.is_json) ? data?.body?.content : JSON.stringify({ query: data?.body?.content }),
      // data: dataq,
      maxBodyLength: Infinity,
    };

    let response;
    // Send http request
    logger.trace(`${logMeta} healthcheck response: ${JSON.stringify(config)}`);

    try {
      response = await axios(config);
      logger.trace(`${logMeta} healthcheck response: ${JSON.stringify(response.data)}`);
      if (response.status === 200) {
        if (response.data?.data?.userProfile?.id) {
          return {
            status: response.status,
            data: response.data,
          };
        }
      }
      throw new Error('healthcheck failed');
    } catch (error) {
      logger.error(`${logMeta} Error while sending healthcheck request: ${error}`);
      return {
        status: error.response.status,
        data: error.response.data,
      };
    }
  } catch (error) {
    logger.error(`${logMeta}: Healthcheck failed: ${error}`);
    throw error;
  }
};

const getMetaData = async (event, logMeta) => {
  try {
    if (!event?.meta?.available) return null;
    const data = event?.meta;
    const apiKey = await getApiKey(event, data, logMeta);

    if (!apiKey) throw new Error('API Key not found, check parameter store');

    const config = {
      method: (data?.request_type) ? data.request_type : 'get',
      url: data?.path,
      headers: {
        Authorization: `${data?.auth_type} ${apiKey}`,
      },
      baseURL: data?.base_url,
      params: data?.query,
      data: (data?.body && data?.body?.is_json) ? data?.body?.content : JSON.stringify(data?.body?.content),
    };

    let response;
    logger.trace(`${logMeta} metadata response: ${JSON.stringify(config)}`);
    try {
      response = await axios(config);
      logger.info(`${logMeta} metadata received successfully`);
      logger.trace(`${logMeta} metadata response: ${JSON.stringify(response.data)}`);
      return {
        status: response.status,
        data: response.data,
      };
    } catch (error) {
      logger.error(`${logMeta} Error while sending metadata request: ${error}`);
      throw new Error('metadata request failed');
      // return {
      //   status: error.response.status,
      //   data: error.response.data,
      // };
    }
  } catch (error) {
    logger.error(`${logMeta}: metadata request failed: ${error}`);
    throw error;
  }
};

module.exports = {
  healthCheck,
  getMetaData,
};
