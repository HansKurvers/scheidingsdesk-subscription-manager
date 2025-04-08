import { app } from "@azure/functions";
import type { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { ClientSecretCredential } from "@azure/identity";
import { DynamicsWebApi } from "dynamics-web-api";
import createMollieClient, { SequenceType } from '@mollie/api-client';


// Mollie API configuration 
const MOLLIE_API_KEY = process.env.MOLLIE_API_KEY as string;
const paymentWebhook = process.env.PAYMENT_WEBHOOK as string;
const mollieRedirect = process.env.MOLLIE_REDIRECT_URL as string;
  
const WEBHOOK_URL = process.env.WEBHOOK_URL;

async function initializeSubscription(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log("Processing subscription initialization request");
    
    try {
        // Parse the request body
        const requestBody: any = await request.json();
        const { email, name, amount } = requestBody;
        
        if (!email) {
            return {
                status: 400,
                body: JSON.stringify({ error: "Email address is required" })
            };
        }
        const mollieClient = createMollieClient({ apiKey: MOLLIE_API_KEY });

        // Step 1: Create a customer in Mollie
        const customer = await mollieClient.customers.create({name: name, email: email})
        context.log(`Customer created with ID: ${customer.id}`);
        
       
        // Step 2: Create a first payment for the customer
        context.log("Creating initial payment");
        const paymentResponse = await mollieClient.payments.create({customerId: customer.id, amount: {
            currency: "EUR",
            value: amount || "0.01"
        }, sequenceType: SequenceType.first, description: 'Eerste betaling', redirectUrl: mollieRedirect, webhookUrl: paymentWebhook })

         // Write customer data to Dataverse
         try {
            await writeCustomerToDataverse(customer.id, customer.email, context);
            context.log(`Successfully wrote customer data to Dataverse: ${customer.id}`);
        } catch (dataverseError) {
            context.error("Error writing to Dataverse:", dataverseError);
            // Continue with payment creation even if Dataverse write fails
        }
        
        // Return success response with payment details
        return {
            status: 200,
            jsonBody: {
                success: true,
                customerId: customer.id,
                paymentId: paymentResponse.id,
                checkoutUrl: paymentResponse.getCheckoutUrl()
            }
        };
    } catch (error: any) {
        context.error("Error processing subscription request:", error);
        
        // Return appropriate error response
        const status = error.response?.status || 500;
        const errorMessage = error.response?.data?.detail || error.message || "Unknown error";
        
        return {
            status: status,
            jsonBody: {
                success: false,
                error: errorMessage
            }
        };
    }
}

async function writeCustomerToDataverse(customerId: string, email: string, context: InvocationContext) {
    const tenantId = process.env.TENANT_ID;
    const appId = process.env.APPLICATION_ID;
    const clientSecret = process.env.CLIENT_SECRET;
    let dataverseUrl = process.env.DATAVERSE_URL; // e.g., https://yourorg.crm.dynamics.com
    const entityName = process.env.ENTITY_NAME || "contacts"; // The table/entity name in Dataverse
    const clientIdField = process.env.CLIENT_ID_FIELD || "mollie_customer_id"; // Field that will store the Mollie customer ID
    const emailField = process.env.EMAIL_FIELD || "emailaddress1"; // Field that will store the email

    if (!tenantId || !appId || !clientSecret || !dataverseUrl) {
        throw new Error("Missing required environment variables for Dataverse connection");
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
        throw new Error(`Invalid Dataverse URL: ${dataverseUrl}. Please provide a valid URL like "https://yourorg.crm.dynamics.com"`);
    }

    // Create the token acquisition function
    const acquireToken = async () => {
        try {
            const credential = new ClientSecretCredential(tenantId, appId, clientSecret);
            const tokenResponse = await credential.getToken(`${dataverseUrl}/.default`);
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
            version: "9.2"  // Using Web API v9.2
        }
    });

    try {
        // Prepare the record to be created in Dataverse
        const record: Record<string, any> = {};
        record[clientIdField] = customerId;
        record[emailField] = email;
        
        
        // Create the record in Dataverse
        const createResult = await dynamicsWebApi.create({
            collection: entityName,
            data: record
        });
        
        context.log(`Successfully created record in Dataverse with ID: ${createResult}`);
        return createResult;
    } catch (error) {
        context.error("Error creating record in Dataverse:", error);
        throw error;
    }
}

// Register the function with Azure Functions
app.http('initializeSubscription', {
    methods: ['POST'],
    route: 'subscription/creator',
    authLevel: 'anonymous',
    handler: initializeSubscription
});