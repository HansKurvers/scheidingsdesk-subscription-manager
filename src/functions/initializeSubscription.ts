import { app } from "@azure/functions";
import type {
	HttpRequest,
	HttpResponseInit,
	InvocationContext,
} from "@azure/functions";
import createMollieClient, { SequenceType } from "@mollie/api-client";
import { writeCustomerToDataverse } from "../services/dataverseService";

// Mollie API configuration
const MOLLIE_API_KEY = process.env.MOLLIE_API_KEY as string;
const paymentWebhook = process.env.PAYMENT_WEBHOOK as string;
const mollieRedirect = process.env.MOLLIE_REDIRECT_URL as string;

const WEBHOOK_URL = process.env.WEBHOOK_URL;

async function initializeSubscription(
	request: HttpRequest,
	context: InvocationContext,
): Promise<HttpResponseInit> {
	context.log("Processing subscription initialization request");

	try {
		// Parse the request body
		const requestBody: any = await request.json();
		const { email, name, amount } = requestBody;

		if (!email) {
			return {
				status: 400,
				body: JSON.stringify({ error: "Email address is required" }),
			};
		}
		const mollieClient = createMollieClient({ apiKey: MOLLIE_API_KEY });

		// Step 1: Create a customer in Mollie
		const customer = await mollieClient.customers.create({
			name: name,
			email: email,
		});
		context.log(`Customer created with ID: ${customer.id}`);

		// Step 2: Create a first payment for the customer
		context.log("Creating initial payment");
		const paymentResponse = await mollieClient.payments.create({
			customerId: customer.id,
			amount: {
				currency: "EUR",
				value: amount || "0.01",
			},
			sequenceType: SequenceType.first,
			description: "Eerste betaling",
			redirectUrl: mollieRedirect,
			webhookUrl: paymentWebhook,
		});

		// Write customer data to Dataverse
		try {
			await writeCustomerToDataverse(customer.id, customer.email, context);
			context.log(
				`Successfully wrote customer data to Dataverse: ${customer.id}`,
			);
		} catch (dataverseError) {
			context.error("Error writing to Dataverse:", dataverseError);
			return {
				status: 500,
				jsonBody: {
					success: false,
					error: dataverseError,
				},
			};
			// Continue with payment creation even if Dataverse write fails
		}

		// Return success response with payment details
		return {
			status: 200,
			jsonBody: {
				success: true,
				customerId: customer.id,
				paymentId: paymentResponse.id,
				checkoutUrl: paymentResponse.getCheckoutUrl(),
			},
		};
	} catch (error: any) {
		context.error("Error processing subscription request:", error);

		// Return appropriate error response
		const status = error.response?.status || 500;
		const errorMessage =
			error.response?.data?.detail || error.message || "Unknown error";

		return {
			status: status,
			jsonBody: {
				success: false,
				error: errorMessage,
			},
		};
	}
}

// Register the function with Azure Functions
app.http("initializeSubscription", {
	methods: ["POST"],
	route: "subscription/initialize",
	authLevel: "anonymous",
	handler: initializeSubscription,
});
