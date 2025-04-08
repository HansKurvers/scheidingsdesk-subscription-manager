import { app } from "@azure/functions";
import type { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import {updateDataverseSubscription} from '../services/dataverseService'
import createMollieClient, { SequenceType } from '@mollie/api-client';

// Mollie API configuration
const MOLLIE_API_KEY = process.env.MOLLIE_API_KEY as string;
const recurringPaymentAmount = process.env.RECURRING_PAYMENT_AMOUNT as string;
const recurringPaymentWebhook = process.env.RECURRING_PAYMENT_WEBHOOK as string;


async function initializeRecurringPayment(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    try {
        context.log("Creating recurring payment");
        
        // Parse form data instead of JSON
        const bodyText = await request.text();
        context.log("Webhook payload:", bodyText);
        
        // Extract the payment ID (form data comes as id=tr_xxx)
        const paymentId = new URLSearchParams(bodyText).get('id');
        
        if (!paymentId) {
            context.log("No payment ID found in webhook");
            return {
                status: 400,
                body: JSON.stringify({ error: "Missing payment ID" })
            };
        }
        
        context.log(`Received webhook for payment: ${paymentId}`);
        
        // Get payment details from Mollie API
        const mollieClient = createMollieClient({ apiKey: MOLLIE_API_KEY });
        const payment = await mollieClient.payments.get(paymentId);
        
        // Check if payment was successful
        if (payment.status !== "paid") {
            context.log(`Payment not successful, status: ${payment.status}`);
            return {
                status: 200, // Still return 200 to acknowledge receipt
                jsonBody: { received: true }
            };
        }
        
        const customerId = payment.customerId;
        
        // Set up subscription (your existing code)
        const startDate = new Date();
        startDate.setDate(startDate.getDate() + 30);
        const startDateShort = startDate.toISOString().split('T')[0] as string;
        
        const recurringPaymentResponse = await mollieClient.customerSubscriptions.create({
            customerId: customerId as string,
            amount: {
                currency: 'EUR',
                value: recurringPaymentAmount
            },
            times: 12,
            interval: '1 days',
            startDate: startDateShort,
            description: 'Recurring payment',
            webhookUrl: recurringPaymentWebhook
        });
        
        let status = false;
        if (recurringPaymentResponse.status === "active") {
            status = true;
        }
        
        await updateDataverseSubscription(customerId as string, status, context);
        
        // Return success
        return {
            status: 200,
            jsonBody: {
                success: true
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

// Register the function with Azure Functions
app.http('recurringPaymentInitializor', {
    methods: ['POST'],
    route: 'subscription/recurring/payments/webhook',
    authLevel: 'anonymous',
    handler: initializeRecurringPayment
});