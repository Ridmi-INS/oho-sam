const { Signer } = require("@aws-sdk/rds-signer");
const { Client } = require("pg");
const logger = require("./logger");

// Global object for connection
let client;

const createConnection = async () => {
    const signer = new Signer({
        // configure options
        region: process.env.AWS_STACK_REGION,
        username: process.env.AWS_DB_USERNAME,
        hostname: process.env.AWS_RDS_PROXY_ENDPOINT,
        port: parseInt(process.env.AWS_RDS_PORT)
    });

    // Get auth token from signer
    const token = await signer.getAuthToken();

    // Database connection object
    client = new Client({
        host: process.env.AWS_RDS_PROXY_ENDPOINT,
        user: process.env.AWS_DB_USERNAME,
        port: process.env.AWS_RDS_PORT,
        password: token, // Token from AWS signer
        database: process.env.AWS_DB_NAME,
        ssl: { rejectUnauthorized: false }
    });

    // Create connection
    try {
        await client.connect();
        logger.debug(`Connected to the database`);
    } catch (error) {
        logger.error(`Failed to connect to database with: ${error}`);
        throw error;
    }
}

// Query function
const query = async (query, values) => {
    try {
        const result = await client.query(query, values);
        logger.debug(`Query: ${query} success`);
        return result;
    } catch (error) {
        logger.error(`Query: ${query} failed with error ${error}`);
        throw error;
    }
};

// Close connection
const closeConnection = async () => {
    try {
        await client.end();
        logger.debug("Closing database connection");
    } catch (error) {
        logger.error(`Failed to close database connection ${error}`);
        throw error;
    }
};

module.exports = {
    createConnection,
    query,
    closeConnection,
};
