import { app } from "@azure/functions";
import type {
	HttpRequest,
	HttpResponseInit,
	InvocationContext,
	Timer,
} from "@azure/functions";
import createMollieClient, { SubscriptionStatus } from "@mollie/api-client"; // Import SubscriptionStatus
import {
	getClientDataFromDataverse,
	updateDataverseSubscription,
} from "../services/dataverseService";

// --- Environment Variables (Keep as they are) ---
const MOLLIE_API_KEY = process.env.MOLLIE_API_KEY as string;
const entityNameSingular = process.env.ENTITY_NAME_SINGULAR || "account";
const clientIdField = process.env.CLIENT_ID_FIELD || "mollie_customer_id"; // Field that stores the Mollie customer ID
const subscriptionField = process.env.SUBSCRIPTION_FIELD || "subscription";
const subscriptionIdField =
	process.env.SUBSCRIPTION_ID_FIELD || "subscriptionId";

async function syncDataverseSubscriptionStatus(
	request: HttpRequest,
	context: InvocationContext,
): Promise<HttpResponseInit> {
	context.log("syncDataverseSubscriptionStatus function started");

	if (!MOLLIE_API_KEY) {
		context.error("MOLLIE_API_KEY environment variable is not set.");
		return {
			status: 500,
			body: JSON.stringify({
				error: "MOLLIE_API_KEY environment variable is not set.",
			}),
		};
		// Exit if Mollie key is missing
	}

	const mollieClient = createMollieClient({ apiKey: MOLLIE_API_KEY });
	const actualPrimaryKeyFieldName = `${entityNameSingular}id`; // Standard convention for the GUID field

	try {
		const records = await getClientDataFromDataverse(context);
		context.log(
			`Retrieved ${records.length} records from Dataverse with a subscription ID.`,
		);

		// 3. Iterate through Dataverse Records and Check Mollie Status
		for (const record of records) {
			const recordGuid = record[actualPrimaryKeyFieldName];
			const mollieSubscriptionId = record[subscriptionIdField];
			const customerSubscriptionId = record[clientIdField];

			context.info(
				`Processing record GUID: ${recordGuid}, Mollie Subscription ID: ${mollieSubscriptionId}, Customer ID: ${customerSubscriptionId}`,
			);

			if (!recordGuid || !mollieSubscriptionId || !customerSubscriptionId) {
				context.warn(
					`Skipping record due to missing GUID or Subscription ID. GUID: ${recordGuid}, Subscription ID: ${mollieSubscriptionId}`,
				);
				continue;
			}
			try {
				// 4. Get Subscription Status from Mollie
				const mollieSubscription = await mollieClient.customerSubscriptions.get(
					mollieSubscriptionId,
					{ customerId: customerSubscriptionId },
				);

				// 5. Determine desired Dataverse status
				const isMollieActive =
					mollieSubscription.status === SubscriptionStatus.active;
				context.log(
					`Mollie subscription ${mollieSubscriptionId} status: ${mollieSubscription.status}. Setting Dataverse status to: ${isMollieActive}`,
				);

				// 6. Update Dataverse Record
				await updateDataverseSubscription(
					customerSubscriptionId,
					mollieSubscriptionId,
					isMollieActive,
					context,
				);
				context.log(`Successfully updated Dataverse record ${recordGuid}`);
			} catch (mollieError: any) {
				// Handle cases where the subscription might not exist in Mollie anymore
				try {
					// Update Dataverse record to inactive if subscription doesn't exist in Mollie
					await updateDataverseSubscription(
						customerSubscriptionId,
						mollieSubscriptionId,
						false,
						context,
					);
					context.log(
						`Set Dataverse record ${recordGuid} subscription status to false as Mollie subscription was not found.`,
					);
				} catch (updateError) {
					context.error(
						`Failed to update Dataverse record ${recordGuid} after Mollie 404 error:`,
						updateError,
					);
				}
			}
		}

		context.log(
			"syncDataverseSubscriptionStatus function finished successfully.",
		);
		return {
			status: 200,
			jsonBody: true,
		};
	} catch (error) {
		context.error(
			"Error during syncDataverseSubscriptionStatus execution:",
			error,
		);
		throw error;
	}
}

app.http("syncDataverseSubscriptionStatus", {
	methods: ["POST"],
	route: "subscription/sync",
	authLevel: "anonymous",
	handler: syncDataverseSubscriptionStatus,
});
