#!/bin/bash
# set -e

##################################################

# Common Parameters
org="oho"
project="connector"
region="us-east-1"

## TODO Change to be a argument passed in - with basic validation for anything not PROD or STAGING
## PROD
#env="prod"
#apibaseurl=""

## STAGING
# env="staging"
# apibaseurl=""


env=$1

if [ "${env}" = "prod" ]; then
    apibaseurl="www.example.com"
	log_level="info"
elif [ "${env}" = "staging" ]; then
    apibaseurl="www.example.com"
	log_level="trace"
else
    echo "invalid parameters"
    exit 1
fi


if [ $? -eq 0 ]; then
    echo "Failed to execute!"
	exit 0;
fi

echo "you are going to deploy the main connector: " ${region} - ${org}-${env}-${project}
read -p "Are you sure you want to deploy the main stack? (y/N)" -n 1 -r
echo    # (optional) move to a new line
if [[ $REPLY =~ ^[Yy]$ ]]
then


	# Install dependencies
	echo "Install npm dependencies"
	bash build.sh

	####################################################
	
	# Database component
	component="db"

	sam validate -t template-aurora-db.yaml
	sam build -t template-aurora-db.yaml
	sam deploy \
	-t template-aurora-db.yaml \
	--stack-name ${org}-${env}-${project}-${component} \
	--region ${region} \
	--confirm-changeset \
	--on-failure DO_NOTHING \
	--resolve-s3 \
	--capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND \
	--no-fail-on-empty-changeset \
	--parameter-overrides Env=${env}

	####################################################

	# API Poller Component
	component="poller"


	sam validate -t template-api-poller.yaml
	sam build -t template-api-poller.yaml
	sam deploy \
	-t template-api-poller.yaml \
	--stack-name ${org}-${env}-${project}-${component} \
	--region ${region} \
	--confirm-changeset \
	--on-failure ROLLBACK \
	--resolve-s3 \
	--capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND \
	--no-fail-on-empty-changeset \
	--parameter-overrides Env=${env} LogLevel=${log_level}

fi

