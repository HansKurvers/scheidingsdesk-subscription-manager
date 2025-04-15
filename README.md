# Subscription Manager (Azure Function)

This Azure Function manages subscriptions, integrating Mollie for payments and Microsoft Dataverse/Dynamics 365 for data storage.

## Functionality

The function provides the following functionalities:

*   **Initialize Subscription**: Initializes a new subscription by creating a Mollie customer and redirecting the user to Mollie for payment.
*   **Create Subscription**: Creates a recurring Mollie subscription after the initial payment.
*   **Validate Subscription**: Validates a client's subscription status against Dataverse.
*   **Sync Dataverse Subscription Status**: Synchronizes subscription statuses between Mollie and Dataverse.
*   **Trigger Subscription Sync**: Manually triggers the subscription synchronization process.

## Functions

### 1. Initialize Subscription (`initializeSubscription`)

*   **Trigger**: HTTP request
*   **Description**: Initializes a new subscription by creating a Mollie customer and redirecting the user to Mollie for payment.
*   **Environment Variables**:
    *   `MOLLIE_API_KEY`: Mollie API key.
    *   `PAYMENT_WEBHOOK`: Webhook URL for Mollie payment updates.
    *   `MOLLIE_REDIRECT_URL`: URL to redirect the user after payment.
    *   `WEBHOOK_URL`: Generic webhook URL.

### 2. Create Subscription (`createSubscription`)

*   **Trigger**: HTTP request
*   **Description**: Creates a recurring Mollie subscription after the initial payment.
*   **Environment Variables**:
    *   `MOLLIE_API_KEY`: Mollie API key.
    *   `RECURRING_PAYMENT_AMOUNT`: Amount for recurring payments.
    *   `RECURRING_PAYMENT_WEBHOOK`: Webhook URL for recurring payment updates.

### 3. Validate Subscription (`validateSubscription`)

*   **Trigger**: HTTP request
*   **Description**: Validates a client's subscription status against Dataverse.
*   **Environment Variables**:
    *   `TENANT_ID`: Microsoft 365 tenant ID.
    *   `APPLICATION_ID`: Azure AD application ID.
    *   `CLIENT_SECRET`: Azure AD application client secret.
    *   `DATAVERSE_URL`: Dataverse/Dynamics 365 environment URL.
    *   `ENTITY_NAME` (optional): Name of the entity/table in Dataverse (default: `contacts`).
    *   `CLIENT_ID_FIELD` (optional): Field containing the client ID (default: `contactid`).
    *   `SUBSCRIPTION_FIELD` (optional): Field containing the subscription data (default: `subscriptionid`).

### 4. Sync Dataverse Subscription Status (`syncDataverseSubscriptionStatus`)

*   **Trigger**: HTTP request
*   **Description**: Synchronizes subscription statuses between Mollie and Dataverse.
*   **Environment Variables**:
    *   `MOLLIE_API_KEY`: Mollie API key.
    *   `ENTITY_NAME_SINGULAR`: Singular name of the entity in Dataverse (default: `account`).
    *   `CLIENT_ID_FIELD`: Field that stores the Mollie customer ID (default: `mollie_customer_id`).
    *   `SUBSCRIPTION_FIELD`: Field containing the subscription data (default: `subscription`).
    *   `SUBSCRIPTION_ID_FIELD`: Field containing the subscription ID (default: `subscriptionId`).

### 5. Trigger Subscription Sync (`triggerSubscriptionSync`)

*   **Trigger**: Timer
*   **Description**: Manually triggers the subscription synchronization process.
*   **Environment Variables**:
    *   `RECURRING_PAYMENT_WEBHOOK`: Webhook URL for recurring payment updates.

## Requirements

*   An Azure account with access to Azure Functions.
*   A Microsoft Dataverse / Dynamics 365 environment.
*   A Mollie account.
*   The correct access credentials for Azure, Dataverse, and Mollie.

## Installation

1.  Create a new Azure Function in the Azure portal or via the Azure CLI.
2.  Upload or copy the code to your Azure Function project.
3.  Configure the necessary environment variables (see below).
4.  Deploy the function to Azure.

## Setting Environment Variables

The following environment variables must be set in the Azure Function configuration:

| Variable                  | Description                                         | Example                                       |
| ------------------------- | --------------------------------------------------- | --------------------------------------------- |
| `MOLLIE_API_KEY`          | Mollie API key                                      | `test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`         |
| `PAYMENT_WEBHOOK`         | Webhook URL for Mollie payment updates              | `https://your-function-app.azurewebsites.net/api/payment-webhook` |
| `MOLLIE_REDIRECT_URL`     | URL to redirect the user after payment             | `https://your-website.com/subscription-success` |
| `WEBHOOK_URL`             | Generic webhook URL                                 | `https://your-function-app.azurewebsites.net/api/webhook` |
| `RECURRING_PAYMENT_AMOUNT`| Amount for recurring payments                       | `10.00`                                         |
| `RECURRING_PAYMENT_WEBHOOK`| Webhook URL for recurring payment updates           | `https://your-function-app.azurewebsites.net/api/recurring-payment-webhook` |
| `TENANT_ID`               | Microsoft 365 tenant ID                             | `12345678-1234-1234-1234-123456789012`        |
| `APPLICATION_ID`          | Azure AD application ID                             | `87654321-4321-4321-4321-210987654321`        |
| `CLIENT_SECRET`           | Azure AD application client secret                  | `your-client-secret-here`                     |
| `DATAVERSE_URL`           | Dataverse/Dynamics 365 environment URL             | `https://your-organization.crm.dynamics.com`   |
| `ENTITY_NAME`             | Name of the entity/table in Dataverse (optional)    | `contacts` (default)                            |
| `CLIENT_ID_FIELD`         | Field containing the client ID (optional)           | `contactid` (default)                           |
| `SUBSCRIPTION_FIELD`      | Field containing the subscription data (optional)   | `subscriptionid` (default)                      |
| `ENTITY_NAME_SINGULAR`    | Singular name of the entity in Dataverse (default) | `account`                                       |
| `SUBSCRIPTION_ID_FIELD`   | Field containing the subscription ID (default)    | `subscriptionId`                                |

You can configure these in the Azure Portal:

1.  Go to your Function App
2.  Click on "Configuration" in the left menu
3.  Add each variable via "New application setting"

## Usage

The functions can be invoked via HTTP requests to their respective endpoints. Refer to the function code for specific request formats and expected responses.

## Security Considerations

*   The functions currently use `authLevel: 'anonymous'`, which means no authentication is required to call the functions.
*   In a production environment, consider changing this to `function` or `admin`.
*   Never store sensitive data like client secrets in the code - always use environment variables or Azure KeyVault.

## Troubleshooting

If you encounter issues:

1.  Verify that all environment variables are set correctly.
2.  Check the Azure Function logs for error messages.
3.  Ensure that the service principal has sufficient permissions on Dataverse.
4.  Ensure that the `DATAVERSE_URL` format is correct.