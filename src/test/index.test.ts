// import { Runtime, DefaultLogger, Worker } from "@temporalio/worker";
// import { Server } from "http";
// import { TestWorkflowEnvironment } from "@temporalio/testing";
// import { WorkflowClient } from "@temporalio/client";
// import assert from "assert";
// import axios, { Axios } from "axios";
// import { before, describe, it } from "mocha";
// import { temporalioMiddleware } from "../";
// import express from "express";

// import * as signalsQueries from "./workflows/signals-queries";
// import * as timer from "./workflows/timer";

// describe("temporalioMiddleware", function () {
//   let server: Server;
//   let worker: Worker;
//   let client: WorkflowClient;
//   let apiClient: Axios;
//   let runPromise: Promise<any>;
//   let workflows: any;
//   let env: TestWorkflowEnvironment;
//   const taskQueue = "temporal-rest-test";

//   describe("using signals-queries", function () {
//     before(async function () {
//       this.timeout(10000);
//       workflows = signalsQueries;

//       // Suppress default log output to avoid logger polluting test output
//       Runtime.install({ logger: new DefaultLogger("WARN") });

//       env = await TestWorkflowEnvironment.createLocal();

//       worker = await Worker.create({
//         connection: env.nativeConnection,
//         workflowsPath: require.resolve("./workflows/signals-queries"),
//         taskQueue,
//       });

//       runPromise = worker.run();

//       client = env.workflowClient;

//       const app = express();
//       app.use(temporalioMiddleware(workflows, client, taskQueue));
//       server = app.listen(3001);

//       apiClient = axios.create({ baseURL: "http://localhost:3001" });
//     });

//     after(async function () {
//       worker.shutdown();
//       await runPromise;
//       await server.close();

//       await env.nativeConnection.close();
//       await env.teardown();
//     });

//     it("allows creating workflows", async function () {
//       const res = await apiClient.post("/workflow/unblockOrCancel");
//       assert.ok(res.data.workflowId);

//       const handle = await client.getHandle(res.data.workflowId);
//       const isBlocked = await handle.query(workflows.isBlockedQuery);
//       assert.strictEqual(isBlocked, true);
//     });

//     it("can query and signal the workflow", async function () {
//       let res = await apiClient.post("/workflow/unblockOrCancel");
//       const { workflowId } = res.data;

//       res = await apiClient.get(`/query/isBlocked/${workflowId}`);
//       assert.ok(res.data.result);

//       await apiClient.put(`/signal/unblock/${workflowId}`);

//       res = await apiClient.get(`/query/isBlocked/${workflowId}`);
//       assert.strictEqual(res.data.result, false);
//     });
//   });

//   describe("using custom router", function () {
//     let router: express.Router;
//     let app: express.Application;

//     before(async function () {
//       this.timeout(10000);
//       workflows = signalsQueries;

//       // Suppress default log output to avoid logger polluting test output
//       Runtime.install({ logger: new DefaultLogger("WARN") });

//       env = await TestWorkflowEnvironment.createLocal();

//       worker = await Worker.create({
//         connection: env.nativeConnection,
//         workflowsPath: require.resolve("./workflows/timer"),
//         taskQueue,
//       });

//       runPromise = worker.run();

//       client = env.workflowClient;

//       apiClient = axios.create({ baseURL: "http://localhost:3001" });
//     });

//     after(async function () {
//       worker.shutdown();
//       await runPromise;
//       await server.close();

//       await env.nativeConnection.close();
//       await env.teardown();
//     });

//     it("allows registering middleware", async function () {
//       this.timeout(10000);

//       app = express();
//       let count = 0;
//       router = express.Router();
//       router.use("/workflow/unblockOrCancel", (_req, _res, next) => {
//         ++count;
//         next();
//       });

//       app.use(temporalioMiddleware(workflows, client, taskQueue, router));
//       server = await app.listen(3001);

//       await apiClient.post("/workflow/unblockOrCancel");
//       assert.strictEqual(count, 1);
//     });
//   });

//   describe("using timer", function () {
//     before(async function () {
//       this.timeout(10000);
//       workflows = timer;

//       // Suppress default log output to avoid logger polluting test output
//       Runtime.install({ logger: new DefaultLogger("WARN") });

//       env = await TestWorkflowEnvironment.createLocal();

//       worker = await Worker.create({
//         connection: env.nativeConnection,
//         workflowsPath: require.resolve("./workflows/timer"),
//         taskQueue,
//       });

//       runPromise = worker.run();

//       client = env.workflowClient;

//       const app = express();
//       app.use(temporalioMiddleware(workflows, client, taskQueue));
//       server = app.listen(3001);

//       apiClient = axios.create({ baseURL: "http://localhost:3001" });
//     });

//     after(async function () {
//       worker.shutdown();
//       await runPromise;
//       await server.close();

//       await env.nativeConnection.close();
//       await env.teardown();
//     });

//     it("can pass args to signals in request body", async function () {
//       let res = await apiClient.post("/workflow/countdownWorkflow");
//       const { workflowId } = res.data;

//       assert.ok(workflowId);

//       res = await apiClient.get(`/query/timeLeft/${workflowId}`);
//       assert.ok(
//         res.data.result >= 1000 && res.data.result <= 1500,
//         res.data.result
//       );

//       res = await apiClient.put(`/signal/setDeadline/${workflowId}`, {
//         deadline: Date.now() + 3000,
//       });
//       assert.ok(res.data.received);

//       res = await apiClient.get(`/query/timeLeft/${workflowId}`);
//       assert.equal(typeof res.data.result, "number");
//       assert.ok(
//         res.data.result >= 1500 && res.data.result <= 3000,
//         res.data.result
//       );
//     });

//     it("can create workflow with a custom id", async function () {
//       const customWorkflowId = "test" + Date.now();
//       let res = await apiClient.post(
//         "/workflow/countdownWorkflow/" + customWorkflowId
//       );
//       const { workflowId } = res.data;

//       assert.equal(workflowId, customWorkflowId);
//     });

//     it("can pass args to workflows in request body", async function () {
//       let res = await apiClient.post("/workflow/countdownWorkflow", {
//         delay: 3000,
//       });
//       const { workflowId } = res.data;

//       assert.ok(workflowId);

//       res = await apiClient.get(`/query/timeLeft/${workflowId}`);
//       assert.ok(res.data.result >= 2500 && res.data.result <= 3000);
//     });

//     it("can pass args to queries in query string", async function () {
//       let res = await apiClient.post("/workflow/countdownWorkflow");
//       const { workflowId } = res.data;

//       assert.ok(workflowId);

//       res = await apiClient.get(`/query/timeLeft/${workflowId}?seconds=true`);
//       assert.strictEqual(res.data.result, 1);
//     });
//   });
// });
// TODO: Rewrite tests
