import { app } from "@azure/functions";
import type { HttpRequest, InvocationContext } from "@azure/functions";
import { updateDataverseSubscription } from "../services/dataverseService";

export async function dataverseTest(
	req: HttpRequest,
	context: InvocationContext,
): Promise<any> {
	await updateDataverseSubscription("test", "f123456", true, context);
	return {
		body: true,
	};
}

app.http("dataverseTest", {
	route: "test",
	handler: dataverseTest,
	authLevel: "anonymous",
});
