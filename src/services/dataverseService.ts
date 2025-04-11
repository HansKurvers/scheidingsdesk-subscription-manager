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
const emailField = process.env.EMAIL_FIELD || "emailaddress1"; // Field that will store the email

interface Account {
    clientid?: string,
    email: string,
    subscription: boolean
}

export async function updateDataverseSubscription(customerId: string, status: boolean, context: InvocationContext) {
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
        onTokenRefresh: acquireToken
    }); 

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
            context.log(`No contact found with id: ${customerId}`);
            throw new Error(`No contact found with id: ${customerId}`);
        }
        
        context.info(`List of contacts with id: ${searchResult.value}`);

        // // Get the record ID
        const recordGuid = searchResult.value[0][actualPrimaryKeyFieldName]; // Extract the GUID
        context.info(`Found contact with PK Field '${primaryKeyFieldName}' value '${searchResult.value[0][primaryKeyFieldName]}' and GUID '${recordGuid}'`);
        // Update the record with new subscription status and customer ID
        const updateData: Record<string, unknown> = {};
        updateData[subscriptionField] = status; 
        
        // --- Add logging here ---
        context.log('Attempting update:');
        context.log(`  Collection: ${entityName}`);
        context.log(`  Key (GUID): ${recordGuid}`); // Log the GUID being used
        context.log(`  Data: ${JSON.stringify(updateData)}`);
        // --- End logging ---

        // Update the record
        const updateResult = await dynamicsWebApi.update({ 
            collection: entityName,
            key: recordGuid, // Use the actual GUID as the key
            data: updateData
        });
        
        context.log(`Successfully updated subscription status for contact with id: ${clientIdField}`);
        return updateResult;
    } catch (error) {
        context.error("Error updating record in Dataverse:", error);
        throw error;
    }  
}  


export async function writeCustomerToDataverse(customerId: string, email: string, context: InvocationContext) {
   

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
    });

    try {
        // Prepare the record to be created in Dataverse
        const record: Record<string, unknown> = {};
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