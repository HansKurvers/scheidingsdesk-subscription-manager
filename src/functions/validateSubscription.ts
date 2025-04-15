import { app } from "@azure/functions";
import type {
	HttpRequest,
	HttpResponseInit,
	InvocationContext,
} from "@azure/functions";
import { ClientSecretCredential } from "@azure/identity";
import { DynamicsWebApi } from "dynamics-web-api";

interface RequestBody {
	clientId: string;
}

/**
 * Azure Function to retrieve client data from Dataverse
 * @param request The HTTP request with client ID in the body
 * @param context The function invocation context
 * @returns HTTP response with client data or error
 */
async function validateSubscription(
	request: HttpRequest,
	context: InvocationContext,
): Promise<HttpResponseInit> {
	context.log("HTTP trigger function processed a request.");

	// Parse request body to get client ID
	const requestBody = (await request.json()) as RequestBody;
	const clientId = requestBody?.clientId;

	if (!clientId) {
		return {
			status: 400,
			jsonBody: { error: "Please provide a clientId in the request body" },
		};
	}

	try {
		// Get Dataverse data
		const clientData = await getClientDataFromDataverse(clientId, context);

		if (!clientData) {
			return {
				status: 404,
				jsonBody: { error: `Client with ID ${clientId} not found` },
			};
		}

		// Return the client data
		return {
			status: 200,
			jsonBody: clientData,
		};
	} catch (error: any) {
		context.error("Error retrieving client data:", error);
		return {
			status: 500,
			jsonBody: {
				error: "An error occurred while retrieving client data",
				details: error.message,
			},
		};
	}
}

/**
 * Function to get client data from Dataverse
 * @param clientId The client ID to look up
 * @param context The function invocation context
 * @returns Client data object or null if not found
 */
async function getClientDataFromDataverse(
	clientId: string,
	context: InvocationContext,
): Promise<any> {
	// Environment variables - store these in your Azure Function Configuration
	const tenantId = process.env.TENANT_ID;
	const appId = process.env.APPLICATION_ID;
	const clientSecret = process.env.CLIENT_SECRET;
	let dataverseUrl = process.env.DATAVERSE_URL; // e.g., https://yourorg.crm.dynamics.com
	const entityName = process.env.ENTITY_NAME || "contacts"; // The table/entity name in Dataverse
	const clientIdField = process.env.CLIENT_ID_FIELD || "contactid"; // Field that contains the client ID
	const subscriptionField = process.env.SUBSCRIPTION_FIELD || "contactid"; // Field that contains the client ID

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
		dataApi: {
			version: "9.2", // Using Web API v9.2
		},
	});

	try {
		// Query for the client record
		const result = await dynamicsWebApi.retrieveMultiple({
			collection: entityName,
			filter: `${clientIdField} eq '${clientId}'`,
			select: [clientIdField, subscriptionField], // Select all fields - modify as needed for specific fields
		});

		// Return the first record if found
		if (result?.value && result.value.length > 0) {
			return result.value[0];
		}

		return null;
	} catch (error) {
		context.error("Error querying Dataverse:", error);
		throw error;
	}
}

// Register the function with Azure Functions
app.http("validateSubscription", {
	methods: ["POST"],
	route: "subscription/validator",
	authLevel: "anonymous",
	handler: validateSubscription,
});
