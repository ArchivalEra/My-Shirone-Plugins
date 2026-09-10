import { createActivityEndpoint } from "./endpoint.js";

export const prerender = false;

const handler = createActivityEndpoint();

export const GET = handler.GET;
export const POST = handler.POST;
export const OPTIONS = handler.OPTIONS;
