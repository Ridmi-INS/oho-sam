const { randomUUID } = require('crypto');
const service = require("./services");
const accService = require("./acc-line-item");
const db = require("./db");
const logger = require('./services/logger');

exports.lineItemHandler = async (event) => {
  const body = JSON.parse(event.Records[0].body);

  // Log meta for better tracking the process
  const logMeta = `Client ID: ${body.client_id}, Batch ID: ${body.batch_id}, 
    Job ID: ${body.job_id}, External Emp Id: ${body.external_emp_id}`;

  try {
    // Create database connection
    await db.createConnection();

    // Verify termination date
    const { terminateStatus, updatedEmp } = await service.verifyTerminationDate(
      JSON.parse(event.Records[0].body),
      logMeta
    );

    // Get next action details
    const { id, nextAction, status, changes } = await service.getNextAction(terminateStatus, updatedEmp, logMeta);

    //  Database actions
    switch (status) {
      case "updateAction": {
        // This will trigger when iteam already exist. update hash table action to current action.
        const hashedEmp = await service.makeHash(updatedEmp, logMeta);
        await service.updateConstituentHash(id, nextAction, updatedEmp, hashedEmp, changes, logMeta);
        await service.updateConstituent(id, nextAction, updatedEmp, hashedEmp, logMeta);
        logger.debug(`${logMeta} : TRIGGERED -> updateAction`);
        break;
      }
      case "delete": {
        if (id != null) {
          // If employee already exist with full_name and external id
          // This block will trigger when item has updated values with already terminated state.
          const hashedEmp = await service.makeHash(updatedEmp, logMeta);
          await service.updateConstituent(id, nextAction, updatedEmp, hashedEmp);
          await service.updateConstituentHash(id, nextAction, updatedEmp, hashedEmp, changes, logMeta);
          logger.debug(`${logMeta} : TRIGGERED -> update with delete`);
        } else {
          // If employee not exist with full_name and external id
          // This block will insert new record with next_action as delete
          const newId = randomUUID();
          const hashedEmp = await service.makeHash(updatedEmp, logMeta);
          await service.addConstituent(newId, nextAction, updatedEmp, hashedEmp, logMeta);
          await service.insertConstituentHash(newId, nextAction, updatedEmp, hashedEmp, changes, logMeta);
          logger.debug(`${logMeta} : TRIGGERED -> insert with delete`);
        }
        break;
      }
      case "post": {
        // This block will insert new record with next_action as post
        const newId = randomUUID();
        const hashedEmp = await service.makeHash(updatedEmp, logMeta);
        await service.addConstituent(newId, nextAction, updatedEmp, hashedEmp, logMeta);
        await service.insertConstituentHash(newId, nextAction, updatedEmp, hashedEmp, changes, logMeta);
        logger.debug(`${logMeta} : TRIGGERED -> insert with post`);
        break;
      }
      case "updateTables": {
        //   // if employee already exist with full_name and external id
        //   // This block will trigger when item has updated values with not terminated state.
        const hashedEmp = await service.makeHash(updatedEmp, logMeta);
        await service.updateConstituent(id, nextAction, updatedEmp, hashedEmp, logMeta);
        await service.updateConstituentHash(id, nextAction, updatedEmp, hashedEmp, changes, logMeta);
        logger.debug(`${logMeta} : TRIGGERED -> update with put`);
        break;
      }
    }

    // If event having accreditation data
    if (updatedEmp.is_accreditation) {
      logger.debug(`${logMeta} : The current constituent has attached accreditation!`);

      // Adding accreditation service expects an accreditation array. here create an array with one accreditation
      const accreditationList = [];
      accreditationList.push(updatedEmp);

      const accEvent = {
        client: { id: body.client_id },
        constituent: {
          external_emp_id: updatedEmp.external_emp_id,
        },
        accreditations: accreditationList,
        data: {
          allow_deactivation: updatedEmp.allow_deactivation,
        },
        constituentNotFound: false,
      };

      await accService.accreditationLineItemService(accEvent);
    }
  } catch (err) {
    logger.error(`${logMeta} : LINE ITEM LAMBDA: ${err}`);
  } finally {
    await db.closeConnection();
  }
};
