const { createHash } = require("crypto");
const moment = require("moment");
const db = require("../db");
const logger = require('./logger');

// const next actions
const updateAction_ = "updateAction";
const delete_ = "delete";
const post_ = "post";
const put_ = "put";
const updateTables_ = "updateTables";

// Create constituent hash
const makeHash = async (empObj, logMeta) => {
  return new Promise(async (resolve, reject) => {
    try {
      let convertedFullName = empObj.full_name;
      let convertedEmail = empObj.email;

      if (convertedFullName) {
        convertedFullName = convertedFullName.toLowerCase().trim();
      }

      if (convertedEmail) {
        convertedEmail = convertedEmail.trim().toLowerCase().trim();
      }

      var hashingEmpObj = {
        external_emp_id: empObj.external_emp_id,
        full_name: convertedFullName,
        client_id: empObj.client_id,
        mobile_number: empObj.mobile_number,
        email: convertedEmail,
        external_id: empObj.external_id,
        active: empObj.active,
      };

      // Adding manger email if exist
      if (empObj?.manager_email) hashingEmpObj.manager_email = empObj.manager_email;

      // Remove key pair which are having null values
      for (const item in hashingEmpObj) {
        if (hashingEmpObj[item] == null) {
          delete hashingEmpObj[item];
        }
      }

      const hash = createHash("sha256");
      hash.on("readable", () => {
        const data = hash.read();
        if (data) {
          logger.debug(`${logMeta} : Hash created`);
          resolve(data.toString("hex"));
        }
      });
      hash.write(JSON.stringify(hashingEmpObj));
      hash.end();
    } catch (err) {
      logger.error(`${logMeta} : HASH CREATE FUNCTION: ${err}`);
      reject(err);
    }
  });
};

// Verify constituent is already exist or not
const verifyConstituentExists = async (hash, logMeta) => {
  try {
    const text = "select * from constituents where hash=($1)";
    const values = [hash];

    const response = await db.query(text, values);

    if (response.rowCount > 0) {
      logger.debug(`${logMeta} : Hash already exist`);
      return response.rows[0].id;
    }
    logger.debug(`${logMeta} : Hash not exist`);
    return null;
  } catch (err) {
    logger.error(`${logMeta} : VERIFY CONSTITUENT EXIST FUNCTION: ${err}`);
    return err;
  }
};

// Get already exists hash's action
const getAlreadyExistHashAction = async (hash, logMeta) => {
  try {
    const text = "select id,next_action from constituents_hash where hash=($1)";
    const values = [hash];

    const response = await db.query(text, values);

    logger.debug(`${logMeta} : Action collected from db`);

    const res = {
      id: response.rows[0].id,
      next_action: response.rows[0].next_action,
    };
    return res;
  } catch (err) {
    logger.error(`${logMeta} : GET ALREADY EXIST HASH ACTION FUNCTION: ${err}`);
    return err;
  }
};

// Verify full name and external id exists
const verifyFullNameAndExternalId = async (emp, logMeta) => {
  try {
    // const text = "select * from constituents where full_name=($1) and external_id=($2) and client_id=($3)";
    const text = "select * from constituents where external_id=($1) and client_id=($2)";

    // const values = [emp.full_name, emp.external_id, emp.client_id];
    const values = [emp.external_id, emp.client_id];

    const response = await db.query(text, values);

    if (response.rowCount > 0) {
      logger.debug(`${logMeta} : Full name and external id already exist`);
      return response.rows[0];
    }
    logger.debug(`${logMeta} : Full name and external id not exist`);
    return null;
  } catch (err) {
    logger.error(`${logMeta} : VERIFY FULL NAME AND EXTERNALID FUNCTION: ${err}`);
    return err;
  }
};

// Verify termination date
const verifyTerminationDate = async (emp, logMeta) => {
  try {
      let activeUser = true;
      
      if (!emp.termination_date && !emp.active) activeUser = false;

      if (emp.termination_date) {
        if (moment(emp.termination_date).isValid()){
          if (moment() > moment(emp.termination_date)) activeUser = false;
        } 
      }

      if (activeUser){
        // If not terminated
        logger.debug(`${logMeta} : Not a terminated employee`);
        return {
          terminateStatus: false,
          updatedEmp: emp,
        };
      }

      // If terminated
      emp.active = false;
      logger.debug(`${logMeta} : Terminated employee`);
      return{
        terminateStatus: true,
        updatedEmp: emp,
      };

  } catch (err) {
    logger.error(`${logMeta} : VERIFY TERMINATION DATE FUNCTION: ${err}`);
    return err;
  }
};

// Get next action, id, status
const getNextAction = async (isTerminated, updatedEmp, logMeta) => {
  try {
    const hashedEmp = await makeHash(updatedEmp, logMeta);
    const hashEmpAlreadyExist = await verifyConstituentExists(hashedEmp, logMeta);
    if (hashEmpAlreadyExist != null) {
      // If hash already there
      const res = await getAlreadyExistHashAction(hashedEmp, logMeta);
      const data = {
        id: res.id,
        nextAction: res.next_action,
        status: updateAction_,            
        changes: null,
      };
      logger.debug(`${logMeta} : STATUS: next_action -> updateAction`);
      return data;
    } else {
      // Hash not already there - different content

      // Check full_name and external_id already there
      const alreadyExistEmp = await verifyFullNameAndExternalId(updatedEmp, logMeta);

      if (alreadyExistEmp === null) {
        // If not have employee
        if (isTerminated) {
          // Set next_action as delete
          const data = {
            id: null,
            nextAction: delete_,
            status: delete_,
            changes: null,
          };
          logger.debug(`${logMeta} : next_action -> insert new as a delete`);
          return data;
        } else {
          // Set next_action as post
          const data = {
            id: null,
            nextAction: post_,
            status: post_,
            changes: null,
          };
          logger.debug(`${logMeta} : next_action -> post`);
          return data;
        }
      } else {
        // If already have a employee
        if (isTerminated) {
          // Set next_action as delete
          const data = {
            id: alreadyExistEmp.id,
            nextAction: delete_,
            status: delete_,
            changes: null,
          };
          logger.debug(`${logMeta} : next_action -> update next action as delete`);
          return data;
        } else {
          const changesList = await identifyChangedFields(updatedEmp, alreadyExistEmp, logMeta);

          // Set next_action as post
          const data = {
            id: alreadyExistEmp.id,
            nextAction: put_,
            status: updateTables_,
            changes: changesList.length !== 0 ? changesList : null ,
          };

          logger.debug(`${logMeta} : next_action -> updateTables`);
          return data;
        }
      }
    }
  } catch (err) {
    logger.error(`${logMeta} : GET NEXT ACTION FUNCTION: ${err}`);
    return err;
  }
};

const identifyChangedFields = async (newDataSet, existDataSet, logMeta) => {
  try {

    if (!newDataSet || !existDataSet) {
      return [];
    }

    const newData = {
      external_emp_id: newDataSet.external_emp_id,
      full_name: newDataSet.full_name,
      mobile_number: newDataSet.mobile_number,
      email: newDataSet.email,
      external_id: newDataSet.external_id,
    }

    const existData = {
      external_emp_id: existDataSet.external_emp_id,
      full_name: existDataSet.full_name,
      mobile_number: existDataSet.mobile_number,
      email: existDataSet.email,
      external_id: existDataSet.external_id,
    }

    const changesList = [];

    for (const item in existData) {

      if (existData[item] && newData[item]) {
        if (existData[item].toString().trim() !== newData[item].toString().trim()) {
          logger.debug(`${logMeta} : Found a change on, ${item}`);
          changesList.push(item)
        }
      } else if (!existData[item] && newData[item] || existData[item] && !newData[item]) {
        logger.debug(`${logMeta} : Found a change on, ${item}`);
        changesList.push(item)
      }      
    }
    logger.debug(`${logMeta} : Changes set, ${changesList}`);
    return changesList;  
  } catch (err) {
    logger.error(`${logMeta} : IDENTIFY DATA CHANGES FUNCTION: ${err}`);
    return [];
}
}

// Insert new record to constituents table
const addConstituent = async (id, nextAction, emp, hashedEmp, logMeta) => {
  try {
    const currentDate = moment().toISOString();

    const text =
      "INSERT INTO constituents (id,created_at,updated_at,external_emp_id,full_name,client_id,mobile_number,email,external_id,active,hash,birth_date,location,manager_email) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)";
    const values = [
      id,
      currentDate,
      currentDate,
      emp.external_emp_id,
      emp.full_name,
      emp.client_id,
      emp.mobile_number,
      emp.email,
      emp.external_id,
      emp.active,
      hashedEmp,
      emp.birth_date,
      emp.location,
      emp?.manager_email ? emp?.manager_email : null
    ];

    const { rowCount } = await db.query(text, values);

    // const { rowCount } = await db.query(query);
    logger.debug(`${logMeta} : Constituents table successfully inserted with ${rowCount} record!`);
    return rowCount;
  } catch (err) {
    logger.error(`${logMeta} : ADD CONSTITUENT FUNCTION: ${err}`);
    return err;
  }
};

// Update constituents table
const updateConstituent = async (id, nextAction, emp, hashedEmp, logMeta) => {
  try {
    const currentDate = moment().toISOString();

    const text =
      "UPDATE constituents SET  updated_at=($1),external_emp_id=($2),full_name=($3),client_id=($4),mobile_number=($5),email=($6),external_id=($7),active =($8),hash=($9),birth_date=($10), location=($11), manager_email=($12) WHERE id=($13)";

    const values = [
      currentDate,
      emp.external_emp_id,
      emp.full_name,
      emp.client_id,
      emp.mobile_number,
      emp.email,
      emp.external_id,
      emp.active,
      hashedEmp,
      emp.birth_date,
      emp.location,
      emp?.manager_email ? emp?.manager_email : null,
      id,
    ];

    const { rowCount } = await db.query(text, values);

    logger.debug(`${logMeta} : Constituent hash table successfully updated with ${rowCount} record!`);
    return rowCount;
  } catch (err) {
    logger.error(`${logMeta} : UPDATE CONSTITUENT FUNCTION: ${err}`);
    return err;
  }
};

// Insert new record to constituents hash table
const insertConstituentHash = async (newId, nextAction, emp, hashedEmp, changes, logMeta) => {
  try {
    const text =
      "INSERT INTO constituents_hash (id,batch_id,job_id,next_action,hash,updated_at,changed_fields) VALUES($1,$2,$3,$4,$5,$6,$7)";

    const values = [newId, emp.batch_id, emp.job_id, nextAction, hashedEmp, moment().toISOString(), changes ? JSON.stringify(changes): null];

    const { rowCount } = await db.query(text, values);

    logger.debug(`${logMeta} : Constituent hash table successfully inserted with ${rowCount} record!`);
    return rowCount;
  } catch (err) {
    logger.error(`${logMeta} : INSERT CONSTITUENT HASH FUNCTION: ${err}`);
    return err;
  }
};

// Update constituent hash table
const updateConstituentHash = async (id, nextAction, emp, hashedEmp, changes, logMeta) => {
  try {
    const currentDate = moment().toISOString();

    const text =
      "UPDATE constituents_hash SET next_action=($1),hash=($2),batch_id=($3),job_id=($4),updated_at=($5),changed_fields=($6) WHERE id=($7)";

    const values = [nextAction, hashedEmp, emp.batch_id, emp.job_id, currentDate, changes ? JSON.stringify(changes): null ,id];
    const { rowCount } = await db.query(text, values);
    logger.debug(`${logMeta} : Constituent hash table successfully updated with ${rowCount} record!`);
    return rowCount;
  } catch (err) {
    logger.error(`${logMeta} : UPDATE CONSTITUENT HASH FUNCTION ${err}`);
    return err;
  }
};

module.exports = {
  verifyTerminationDate,
  getNextAction,
  updateConstituentHash,
  makeHash,
  updateConstituent,
  addConstituent,
  insertConstituentHash,
};
