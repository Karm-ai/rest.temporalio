import { WorkflowClient } from "@temporalio/client";
import {
  QueryDefinition,
  SignalDefinition,
  UpdateDefinition,
  Workflow,
} from "@temporalio/common";
import express, { Router } from "express";
import { v4 } from "uuid";

const signalValidators = new WeakMap<SignalDefinition<any[]>, Function>();

export function useValidator(signal: SignalDefinition, fn: Function): void {
  signalValidators.set(signal, fn);
}

export function temporalioMiddleware(
  workflows: any,
  client: WorkflowClient,
  taskQueue: string,
  router?: Router
) {
  if (router === undefined) {
    router = Router();
  }

  for (const key of Object.keys(workflows)) {
    const value: any = workflows[key];
    if (typeof value === "function") {
      // Workflow
      createWorkflowEndpoint(router, client, key, value as Workflow, taskQueue);
      cancelWorkflowEndpoint(router, client);
    } else if (typeof value === "object" && value != null) {
      if (value["type"] === "signal") {
        // Signal
        createSignalEndpoint(
          router,
          client,
          value as SignalDefinition<unknown[]>
        );
      } else if (value["type"] === "query") {
        // Query
        createQueryEndpoint(
          router,
          client,
          value as QueryDefinition<unknown, unknown[]>
        );
      } else if (value["type"] === "update") {
        // Query
        createUpdateEndpoint(
          router,
          client,
          value as UpdateDefinition<unknown, []>
        );
      }
    }
  }

  return router;
}

function createWorkflowEndpoint(
  router: Router,
  client: WorkflowClient,
  name: string,
  fn: Workflow,
  taskQueue: string
) {
  router.post(
    `/workflow/${name}`,
    express.json(),
    function (req: express.Request, res: express.Response) {
      const workflowId = req.body?.workflowId || `${name}_${v4()}`;

      const opts = {
        taskQueue,
        workflowId,
        args: [req.body],
      };
      client.start(fn, opts).then(() => res.status(201).json({ workflowId }));
    }
  );

  router.post(
    `/workflow/${name}`,
    express.json(),
    function (req: express.Request, res: express.Response) {
      const workflowId = req.body?.workflowId || `${name}_${v4()}`;

      const opts = {
        taskQueue,
        workflowId,
        args: [req.body],
      };
      client
        .execute(fn, opts)
        .then((response) => res.status(201).send(response));
    }
  );

  router.post(
    `/workflow/${name}/:workflowId`,
    express.json(),
    function (req: express.Request, res: express.Response) {
      const workflowId = req.params.workflowId;
      const opts = {
        taskQueue,
        workflowId,
        args: [req.body],
      };

      client
        .start(fn, opts)
        .then(() => res.json({ workflowId }))
        .catch(defaultErrorHandlingMiddleware(req, res));
    }
  );
}

function createSignalEndpoint(
  router: Router,
  client: WorkflowClient,
  signal: SignalDefinition<any[]>
) {
  router.put(
    `/signal/${signal.name}/:workflowId`,
    express.json(),
    function (req: express.Request, res: express.Response) {
      let data = req.body;

      let fn: Function | undefined = signalValidators.get(signal);
      if (fn != null) {
        data = fn(data);
      }

      const handle = client.getHandle(req.params.workflowId);
      handle
        .signal(signal, req.body)
        .then(() => res.json({ received: true }))
        .catch(defaultErrorHandlingMiddleware(req, res));
    }
  );
}

function createQueryEndpoint(
  router: Router,
  client: WorkflowClient,
  query: QueryDefinition<any, any[]>
) {
  router.get(`/query/${query.name}/:workflowId`, function (req, res) {
    const handle = client.getHandle(req.params.workflowId);

    handle
      .query(query, req.query)
      .then((result) => res.json({ result }))
      .catch(defaultErrorHandlingMiddleware(req, res));
  });
}

function createUpdateEndpoint(
  router: Router,
  client: WorkflowClient,
  update: UpdateDefinition<any, []>
) {
  router.patch(
    `/update/${update.name}/:workflowId`,
    express.json(),
    function (req: express.Request, res: express.Response) {
      let data = req.body;

      const handle = client.getHandle(req.params.workflowId);

      handle
        .executeUpdate(update, data)
        .then((result) => res.send(result))
        .catch(defaultErrorHandlingMiddleware(req, res));
      // TODO: Implement custom logic to handle errors
    }
  );
}

function cancelWorkflowEndpoint(router: Router, client: WorkflowClient) {
  router.delete(`/workflow/:workflowId`, function (req, res) {
    const handle = client.getHandle(req.params.workflowId);

    handle
      .cancel()
      .then(() => res.status(204).send())
      .catch(defaultErrorHandlingMiddleware(req, res));
  });
}

function defaultErrorHandlingMiddleware(
  req: express.Request,
  res: express.Response,
  next?: express.NextFunction
) {
  return (err: any) => {
    console.error(err);
    return res
      .status(err?.code > 200 && err?.code < 600 ? err.code : 500)
      .json({ message: err.message, issues: err?.issues });
  };
}
