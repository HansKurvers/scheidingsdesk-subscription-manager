import type { InvocationContext } from "@azure/functions";
import { ClientSecretCredential } from "@azure/identity";
// import { updateProperty, WebApiConfig } from "dataverse-webapi";
import { DynamicsWebApi } from "dynamics-web-api";

const tenantId = process.env.TENANT_ID;
const appId = process.env.APPLICATION_ID;
const clientSecret = process.env.CLIENT_SECRET;
let dataverseUrl = process.env.DATAVERSE_URL; // e.g., https://yourorg.crm.dynamics.com
const entityName = process.env.ENTITY_NAME || "accounts";
const entityNameSingular = process.env.ENTITY_NAME_SINGULAR || "account";
const clientIdField = process.env.CLIENT_ID_FIELD || "mollie_customer_id"; // Field that will store the Mollie customer ID
const subscriptionField = process.env.SUBSCRIPTION_FIELD || "subscription";
const subscriptionIdField =
	process.env.SUBSCRIPTION_ID_FIELD || "subscriptionId";

const emailField = process.env.EMAIL_FIELD || "emailaddress1"; // Field that will store the email

interface Account {
	clientid?: string;
	email: string;
	subscription: boolean;
}

export async function addDataverseSubscription(
	customerId: string,
	subscriptionId: string,
	status: boolean,
	context: InvocationContext,
) {
	const dynamicsWebApi = await initializeContext(context);

	try {
		const primaryKeyFieldName = clientIdField; // As provided by the user
		const actualPrimaryKeyFieldName = `${entityNameSingular}id`; // Standard convention for the GUID field
		const filter = `${primaryKeyFieldName} eq '${customerId}'`;

		const searchResult = await dynamicsWebApi.retrieveMultiple({
			collection: entityName,
			// Select the field used for filtering AND the actual primary key (GUID) field
			select: [primaryKeyFieldName, actualPrimaryKeyFieldName],
			filter: filter,
		});

		// // Check if contact was found
		if (!searchResult.value || searchResult.value.length === 0) {
			console.log(`No contact found with id: ${customerId}`);
			throw new Error(`No contact found with id: ${customerId}`);
		}

		console.log(`List of contacts with id: ${searchResult.value}`);

		// // Get the record ID
		const recordGuid = searchResult.value[0][actualPrimaryKeyFieldName]; // Extract the GUID
		console.info(
			`Found contact with PK Field '${primaryKeyFieldName}' value '${searchResult.value[0][primaryKeyFieldName]}' and GUID '${recordGuid}'`,
		);
		// Update the record with new subscription status and customer ID
		const updateData: Record<string, unknown> = {};
		updateData[subscriptionField] = status;
		updateData[subscriptionIdField] = subscriptionId;

		// Update the record
		const updateResult = await dynamicsWebApi.update({
			collection: entityName,
			key: recordGuid, // Use the actual GUID as the key
			data: updateData,
		});

		console.log(
			`Successfully updated subscription status for contact with id: ${clientIdField}`,
		);
		return updateResult;
	} catch (error) {
		console.error("Error updating record in Dataverse:", error);
		throw error;
	}
}

export async function updateDataverseSubscription(
	customerId: string,
	subscriptionId: string,
	status: boolean,
	context: InvocationContext,
) {
	const dynamicsWebApi = await initializeContext(context);

	try {
		const primaryKeyFieldName = clientIdField; // As provided by the user
		const actualPrimaryKeyFieldName = `${entityNameSingular}id`; // Standard convention for the GUID field
		const filter = `${primaryKeyFieldName} eq '${customerId}'`;

		const searchResult = await dynamicsWebApi.retrieveMultiple({
			collection: entityName,
			// Select the field used for filtering AND the actual primary key (GUID) field
			select: [primaryKeyFieldName, actualPrimaryKeyFieldName],
			filter: filter,
		});

		// // Check if contact was found
		if (!searchResult.value || searchResult.value.length === 0) {
			console.log(`No contact found with id: ${customerId}`);
			throw new Error(`No contact found with id: ${customerId}`);
		}

		console.info(`List of contacts with id: ${searchResult.value}`);

		// // Get the record ID
		const recordGuid = searchResult.value[0][actualPrimaryKeyFieldName]; // Extract the GUID
		console.info(
			`Found contact with PK Field '${primaryKeyFieldName}' value '${searchResult.value[0][primaryKeyFieldName]}' and GUID '${recordGuid}'`,
		);
		// Update the record with new subscription status and customer ID
		const updateData: Record<string, unknown> = {};
		updateData[subscriptionField] = status;

		// Update the record
		const updateResult = await dynamicsWebApi.update({
			collection: entityName,
			key: recordGuid, // Use the actual GUID as the key
			data: updateData,
		});

		console.log(
			`Successfully updated subscription status for contact with id: ${clientIdField}`,
		);
		return updateResult;
	} catch (error) {
		console.error("Error updating record in Dataverse:", error);
		throw error;
	}
}

export async function writeCustomerToDataverse(
	customerId: string,
	email: string,
	context: InvocationContext,
) {
	const dynamicsWebApi = await initializeContext(context);

	try {
		// Prepare the record to be created in Dataverse
		const record: Record<string, unknown> = {};
		record[clientIdField] = customerId;
		record[emailField] = email;

		// Create the record in Dataverse
		const createResult = await dynamicsWebApi.create({
			collection: entityName,
			data: record,
		});

		console.log(
			`Successfully created record in Dataverse with ID: ${createResult}`,
		);
		return createResult;
	} catch (error) {
		console.error("Error creating record in Dataverse:", error);
		throw error;
	}
}

export async function getClientDataFromDataverse(context: InvocationContext) {
	const dynamicsWebApi = await initializeContext(context);
	const actualPrimaryKeyFieldName = `${entityNameSingular}id`; // Standard convention for the GUID field

	console.log(`Workspaceing records from Dataverse entity: ${entityName}`);

	// 2. Fetch Records from Dataverse that have a Subscription ID
	// Select the actual primary key (GUID) and the subscription ID field
	// Filter for records where the subscription ID field is not null
	const retrieveOptions = {
		collection: entityName,
		select: [actualPrimaryKeyFieldName, subscriptionIdField, clientIdField],
		filter: `${subscriptionIdField} ne null`,
	};

	// Handle potential pagination if you have many records
	let records: any[] = [];
	let result = await dynamicsWebApi.retrieveMultiple(retrieveOptions);
	records = records.concat(result.value);

	while (result["@odata.nextLink"]) {
		console.log("Fetching next page of Dataverse records...");
		result = await dynamicsWebApi.retrieveMultiple(
			retrieveOptions,
			result["@odata.nextLink"],
		);
		records = records.concat(result.value);
	}

	console.log(
		`Retrieved ${records.length} records from Dataverse with a subscription ID.`,
	);
	return records;
}

async function initializeContext(context: InvocationContext) {
	if (!tenantId || !appId || !clientSecret || !dataverseUrl) {
		throw new Error(
			"Missing required environment variables for Dataverse connection",
		);
	}
	// If URL doesn't start with https://, add it
	if (!dataverseUrl.startsWith("https://")) {
		dataverseUrl = `https://${dataverseUrl}`;
	}

	// Make sure the URL is valid
	try {
		new URL(dataverseUrl);
	} catch (e) {
		context.error(`Invalid Dataverse URL format: ${dataverseUrl}`);
		throw new Error(
			`Invalid Dataverse URL: ${dataverseUrl}. Please provide a valid URL like "https://yourorg.crm.dynamics.com"`,
		);
	}

	// Create the token acquisition function
	const acquireToken = async () => {
		try {
			const credential = new ClientSecretCredential(
				tenantId,
				appId,
				clientSecret,
			);
			const tokenResponse = await credential.getToken(
				`${dataverseUrl}/.default`,
			);
			return tokenResponse.token;
		} catch (error) {
			context.error("Error acquiring token:", error);
			throw error;
		}
	};

	// Initialize DynamicsWebApi with proper configuration
	const dynamicsWebApi = new DynamicsWebApi({
		serverUrl: dataverseUrl,
		onTokenRefresh: acquireToken,
	});

	return dynamicsWebApi;
}
