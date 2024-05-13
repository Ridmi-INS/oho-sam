const { randomUUID } = require('crypto');
const accreds = require("./services/accreditations");
const logger = require('../services/logger');

const nextAction = {
  post: "post",
  activate: "activate",
  deactivate: "deactivate",
  delete: "delete",
};

// Main function
const accreditationLineItemService = async (event) => {
  const logMeta = `Client: ${event.client.id}, ExternalEmpId: ${event.constituent.external_emp_id}`;

  try {
    // Create valid qualifications list from client qualifications
    const fetchedQualifications = [];
    for (const accred of event.accreditations) {
      if (
        accred.certificate_number === null ||
        accred.full_name === null ||
        accred.type_name === null ||
        accred.mapped_type === null
      ) {
        // log
        logger.warn(`${logMeta} : This record will ignore because of mandatory feilds check failed at ${accred.external_emp_id}, Data: [certificate number: ${accred.certificate_number}, 
          full name: ${accred.full_name}, type name: ${accred.type_name}, mapped type: ${accred.mapped_type}]`);
      } else {
        fetchedQualifications.push(accred);
      }
    }

    // Fetch already exist accreditations for the current constituent from database
    const existAccreditations = await accreds.fetchExistAccreditations(event, logMeta);

    // Iterate fetched accreditations, purpose - check each accretation hash exist, if not exist create new accretation, if exist with inactive status change next action to activate
    for (const qualification of fetchedQualifications) {
      // Create hash for accretation
      const hashedQualification = await accreds.makeHash(qualification, logMeta);

      // Store the hash current accretation object itself
      qualification.hash = hashedQualification;

      // Check current fetched qualification exist in db already or not - if yes return exist record hash, status. if no return undefined
      const existAccResult = existAccreditations.find((accreditation) => accreditation.hash === hashedQualification);

      logger.debug(`${logMeta} : Db exist check result: ${existAccResult}`);

      if (existAccResult == undefined) {
        // Result undefine means there is no hash match - next stpe - create new accreditation with status post
        const newId = randomUUID();
        await accreds.insertAccreditation(newId, qualification, hashedQualification, logMeta);
        await accreds.insertAccreditationHash(newId, nextAction.post, qualification, hashedQualification, logMeta);
      } else {
        // Hash is already there, next step - check exist accreditation active === false, if inactive update next action as activate
        if (existAccResult.active === false) {
          await accreds.updateAccreditationHash(nextAction.activate, hashedQualification, logMeta);
          await accreds.updateAccreditation(true, hashedQualification, logMeta);
        } else {
          // log
          logger.debug(`${logMeta} : Accreditation already in activate status`);
        }
      }
    }

    const allowDeactivation = String(event?.data?.allow_deactivation).toLowerCase() === "true";

    // Disable deactivation by default
    if (allowDeactivation) {
      logger.debug(`${logMeta} Accreditaiton deactivation is enabled`);
      // Iterate alreday exist accreditations, purpose - check each db already has accretation match with fetched accreditation list, if not exist(missing) set next action as deactivate
      for (const accreditation of existAccreditations) {
        // Check db exist accreditation is missing or not
        const dbCompareResult = fetchedQualifications.find(
          (fetchedQualification) => fetchedQualification.hash === accreditation.hash
        );

        // If the result is undefined means accreditation is missing
        if (dbCompareResult === undefined) {
          // log
          logger.debug(`${logMeta} : Accreditation missing check result: ${dbCompareResult}`);

          // Check the status of missing accreditation, if status is active next step is set status to deactivate
          if (accreditation.active === true) {
            await accreds.updateAccreditationHash(nextAction.deactivate, accreditation.hash, logMeta);
            await accreds.updateAccreditation(false, accreditation.hash, logMeta);
          } else {
            // log
            logger.debug(`${logMeta} : Accreditation status : not active`);
          }
        } else {
          // log
          logger.debug(`${logMeta} : Accreditation matched`);
        }
      }
    } else {
      logger.debug(`${logMeta} Accreditation deactivation is disabled`);
    }

    // If constituent has removed by client side(404), set next action to delete in constituent hash table
    if (event.constituentNotFound) {
      // Update next action to delete for current constituent
      await accreds.updateConstituentHash(event.constituent.id, nextAction.delete, logMeta);

      // Set next action as delete for event
      event.constituent_hash.next_action = nextAction.delete;

      // Remove constituent not found property from event
      delete event.constituentNotFound;
    }

    // If a constituent has empty current fetch qualification list and empty alredady exist list, that constituent support to have "nop" as a next action
    if (fetchedQualifications.length === 0 && existAccreditations.length === 0) {
      // Let step function know current constituent hasnt any accreditations
      event.state = "onAccreditationNotRecognized";
    } else {
      //  Let step function know current constituent has valid accrediations and need to procees more
      event.state = "onLineItemUpdated";
    }

    // Fetch all accreditations with next action for send back to the step function
    const finalizedAccreditations = await accreds.getAccreditationsData(event.constituent.external_emp_id, logMeta);

    // Remove already attached accreditations
    delete event.accreditations;

    // Set finalized accreditations list
    event.accreditations = finalizedAccreditations;

    return {
      statusCode: 200,
      body: event,
    };
  } catch (error) {
    logger.error(`${logMeta} : Accreditation create/update line item : Error: ${error}`);
    return error;
  } 
};

module.exports = {
  accreditationLineItemService,
};
