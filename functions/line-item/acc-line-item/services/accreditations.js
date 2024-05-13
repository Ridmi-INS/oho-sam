const { createHash } = require("crypto");
const moment = require("moment");
const db = require("../../db");
const logger = require('../../services/logger');

// Create hash for accretation
const makeHash = async (qualificationObj, logMeta) => {
  return new Promise(async (resolve, reject) => {
    try {
      var convertedFullName = qualificationObj.full_name;
      var convertedTypeName = qualificationObj.type_name;

      if (convertedFullName !== null) {
        convertedFullName = convertedFullName.toLowerCase().trim();
      }

      if (convertedTypeName !== null) {
        convertedTypeName = convertedTypeName.trim().toLowerCase().trim();
      }

      var hashingQualificationObj = {
        identifier: qualificationObj.certificate_number,
        type: convertedTypeName,
        expiry: qualificationObj.date_expire,
        full_name: convertedFullName,
        external_emp_id: qualificationObj.external_emp_id,
        client_id: qualificationObj.client_id,
      };

      // Remove key pair which are having null values
      if (hashingQualificationObj.identifier === null) {
        delete hashingQualificationObj.identifier;
      }
      if (hashingQualificationObj.type === null) {
        delete hashingQualificationObj.type;
      }
      if (hashingQualificationObj.expiry === null) {
        delete hashingQualificationObj.expiry;
      }
      if (hashingQualificationObj.full_name === null) {
        delete hashingQualificationObj.full_name;
      }
      if (hashingQualificationObj.external_emp_id === null) {
        delete hashingQualificationObj.external_emp_id;
      }
      if (hashingQualificationObj.client_id === null) {
        delete hashingQualificationObj.client_id;
      }

      const hash = createHash("sha256");
      hash.on("readable", () => {
        const data = hash.read();
        if (data) {
          // log
          logger.debug(`${logMeta} : Hash created : Success`);
          resolve(data.toString("hex"));
        }
      });
      hash.write(JSON.stringify(hashingQualificationObj));
      hash.end();
    } catch (error) {
      // log
      logger.error(`${logMeta} : Make hash function : Error: ${error}`);
      reject(error);
    }
  });
};

// Create new accretation
const insertAccreditation = async (id, data, hashedQualification, logMeta) => {
  try {
    const currentDate = moment().toISOString();

    const text = `INSERT INTO accreditations (
        id,
        identifier,
        type,
        mapped_type,
        expiry,
        full_name,
        external_emp_id,
        external_id,
        external_qualification_id,
        client_id,
        hash,
        created_at,
        updated_at,
        constituent_id,
        accreditation_id,
        active,
        prev_identifier)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`;

    const values = [
      id,
      data.certificate_number,
      data.type_name,
      data.mapped_type,
      data.date_expire,
      data.full_name,
      data.external_emp_id,
      data.external_id,
      data.qualification_guid,
      data.client_id,
      hashedQualification,
      currentDate,
      currentDate,
      null,
      null,
      true,
      null,
    ];

    const { rowCount } = await db.query(text, values);

    // log
    logger.debug(`${logMeta} : Accreditation table insert : Success : Result , ${rowCount}`);
    return rowCount;
  } catch (error) {
    // log
    logger.error(`${logMeta} : Accreditation insert function : Error : ${error}`);
    return error;
  }
};

// Create new accreditation hash
const insertAccreditationHash = async (newId, nextAction, data, hashedQualification, logMeta) => {
  try {
    const text =
      "INSERT INTO accreditations_hash (id,external_emp_id,next_action,updated_at,hash,correlation_id,status) VALUES($1,$2,$3,$4,$5,$6,$7)";

    const values = [newId, data.external_emp_id, nextAction, moment().toISOString(), hashedQualification, null, null];

    const { rowCount } = await db.query(text, values);

    // log
    logger.debug(`${logMeta} : Accreditation hash table insert : Success : Result , ${rowCount}`);
    return rowCount;
  } catch (error) {
    // log
    logger.error(`${logMeta} : Accreditation hash insert function : Error ${error}`);
    return error;
  }
};

// Update constituent hash table
const updateAccreditation = async (active, hashedQualification, logMeta) => {
  try {
    const text = "UPDATE accreditations SET active=($1),updated_at=($2) WHERE hash=($3)";

    const values = [active, moment().toISOString(), hashedQualification];

    const { rowCount } = await db.query(text, values);

    // log
    logger.debug(`${logMeta} : Accreditation hash table update : Success : Result , ${rowCount}`);
    return rowCount;
  } catch (error) {
    // log
    logger.error(`${logMeta} : Accreditation hash update function : Error : ${error}`);
    return error;
  }
};

// Update constituent hash table
const updateAccreditationHash = async (nextAction, hashedQualification, logMeta) => {
  try {
    const text = "UPDATE accreditations_hash SET next_action=($1),updated_at=($2) WHERE hash=($3)";

    const values = [nextAction, moment().toISOString(), hashedQualification];

    const { rowCount } = await db.query(text, values);

    // log
    logger.debug(`${logMeta} : Accreditation hash table update : Success : Result , ${rowCount}`);
    return rowCount;
  } catch (error) {
    // log
    logger.error(`${logMeta} : Accreditation hash update function : Error : ${error}`);
    return error;
  }
};

// Fetch all accreditations for current constituent
const fetchExistAccreditations = async (event, logMeta) => {
  try {
    const query = "select hash,active from accreditations where external_emp_id=($1) and client_id=$2";
    const values = [event.constituent.external_emp_id, event.client.id];

    const response = await db.query(query, values);

    if (response.rowCount > 0) {
      // log
      logger.debug(`${logMeta} : Fetched already exist accreditations: Success : Result, ${response.rowCount}`);

      return response.rows;
    } else {
      // log
      logger.debug(`${logMeta} : Fetched already exist accreditations: Success : Result, ${response.rowCount}`);
      return [];
    }
  } catch (error) {
    // log
    logger.error(`${logMeta} : Fetch exist accreditations function : Error: ${error}`);
    return error;
  }
};

// Update constituent hash table next action -> delete (handling 404)
const updateConstituentHash = async (id, nextAction, logMeta) => {
  try {
    const currentDate = moment().toISOString();

    const text = "UPDATE constituents_hash SET next_action=($1),updated_at=($2) WHERE id=($3)";

    const values = [nextAction, currentDate, id];

    const { rowCount } = await db.query(text, values);
    logger.debug(`${logMeta} : Constituent hash table update : Success : Result , ${rowCount}!`);
    return rowCount;
  } catch (error) {
    logger.error(`${logMeta} : Constituent hash update function : Error : ${error}`);
    return error;
  }
};

// Fetch all accreditations for current constituent
const getAccreditationsHashData = async (external_emp_id, logMeta) => {
  try {
    const text = "select id,next_action from accreditations_hash where external_emp_id=($1)";
    const values = [external_emp_id];

    const response = await db.query(text, values);

    if (response.rowCount > 0) {
      // log
      logger.debug(`${logMeta} : Fetched latest accreditations hash: Success : Result, ${response.rowCount}`);

      return response.rows;
    } else {
      // log
      logger.ebug(`${logMeta} : Fetched latest accreditations hash: Success : Result, ${response.rowCount}`);
      return [];
    }
  } catch (error) {
    // log
    logger.error(`${logMeta} : Fetched latest accreditations hash function : Error: ${error}`);
    return error;
  }
};

// Fetch all accreditations for current constituent
const getAccreditationsData = async (external_emp_id, logMeta) => {
  try {
    const text = "select * from accreditations where external_emp_id=($1)";
    const values = [external_emp_id];

    const response = await db.query(text, values);

    if (response.rowCount > 0) {
      // log
      logger.debug(`${logMeta} : Fetched latest accreditations: Success : Result, ${response.rowCount}`);

      const accHashData = await getAccreditationsHashData(external_emp_id, logMeta);

      for (var accreditation of response.rows) {
        const result = accHashData.find((hashData) => hashData.id === accreditation.id);
        if (result == undefined) {
          // log
          logger.debug(`${logMeta} : Next action data not found in hash object`);
        } else {
          // Set next action to curent accreditation
          accreditation.accreditation_hash = {
            next_action: result.next_action,
          };
        }
      }

      return response.rows;
    } else {
      // log
      logger.debug(`${logMeta} : Fetched latest accreditations: Success : Result, ${response.rowCount}`);
      return [];
    }
  } catch (error) {
    // log
    logger.error(`${logMeta} : Fetched latest accreditations function : Error : ${error}`);
    return error;
  }
};

module.exports = {
  makeHash,
  insertAccreditation,
  insertAccreditationHash,
  updateAccreditation,
  updateAccreditationHash,
  fetchExistAccreditations,
  updateConstituentHash,
  getAccreditationsData,
};
