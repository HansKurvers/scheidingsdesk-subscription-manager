import { app } from "@azure/functions";
import type { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { ClientSecretCredential } from "@azure/identity";
import { DynamicsWebApi } from "dynamics-web-api";
import axios from "axios";

// Mollie API configuration
const MOLLIE_API_KEY = process.env.MOLLIE_API_KEY;
const MOLLIE_API_URL = "https://api.mollie.com/v2";

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
        
        // Configure Mollie API client
        const mollieClient = axios.create({
            baseURL: MOLLIE_API_URL,
            headers: {
                'Authorization': `Bearer ${MOLLIE_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        
        // Step 1: Create a customer in Mollie
        context.log(`Creating customer for email: ${email}`);
        const customerResponse = await mollieClient.post('/customers', {
            email: email,
            name: name || email.split('@')[0]  // Use part of email as name if not provided
        });
        
        const customerId = customerResponse.data.id;
        context.log(`Customer created with ID: ${customerId}`);
        
        // Write customer data to Dataverse
        try {
            await writeCustomerToDataverse(customerId, email, context);
            context.log(`Successfully wrote customer data to Dataverse: ${customerId}`);
        } catch (dataverseError) {
            context.error("Error writing to Dataverse:", dataverseError);
            // Continue with payment creation even if Dataverse write fails
        }
        
        // Step 2: Create a first payment for the customer
        context.log("Creating initial payment");
        const paymentResponse = await mollieClient.post('/payments', {
            amount: {
                currency: "EUR",
                value: amount || "0.01" 
            },
            webhookUrl: WEBHOOK_URL,
            customerId: customerId,
            sequenceType: "first"  // Indicates this is the first payment in a recurring sequence
        });
        
        // Return success response with payment details
        return {
            status: 200,
            jsonBody: {
                success: true,
                customerId: customerId,
                paymentId: paymentResponse.data.id,
                checkoutUrl: paymentResponse.data._links.checkout.href
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