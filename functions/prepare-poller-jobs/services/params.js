const { SSMClient, GetParameterCommand } = require("@aws-sdk/client-ssm");
const ssm = new SSMClient();
const logger = require('./logger');

const getParameter = async (name) => {
  try {
    const paramRequest = {
      Name: name,
      WithDecryption: true,
    };
    const request = await ssm.send(new GetParameterCommand(paramRequest));
    return request.Parameter.Value;
  } catch (error) {
    logger.error(`Failed to get parameter function, error: ${error}`);
    throw new Error(error);
  }
};

module.exports = {
  getParameter,
};
