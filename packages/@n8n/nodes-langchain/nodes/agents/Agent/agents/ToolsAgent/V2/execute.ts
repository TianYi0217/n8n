import type { ChatPromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';
import { AgentExecutor, createToolCallingAgent } from 'langchain/agents';
import { omit } from 'lodash';
import { jsonParse, NodeOperationError, sleep } from 'n8n-workflow';
import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';

import { getPromptInputByType } from '@utils/helpers';
import { getOptionalOutputParser } from '@utils/output_parsers/N8nOutputParser';

import {
	fixEmptyContentMessage,
	getAgentStepsParser,
	getChatModel,
	getOptionalMemory,
	getTools,
	prepareMessages,
	preparePrompt,
} from '../common';
import { SYSTEM_MESSAGE } from '../prompt';

/* -----------------------------------------------------------
   Helper Functions
----------------------------------------------------------- */

/**
 * Extracts clean text output from complex Anthropic response structures
 * @param output - The raw output from the agent
 * @returns Clean text string
 */
function extractCleanOutput(output: any): string {
	// If output is already a string, return it
	if (typeof output === 'string') {
		return output;
	}

	// If output is an array (like from Anthropic thinking), extract text content
	if (Array.isArray(output)) {
		const textBlocks = output.filter((item) => item?.type === 'text' && item?.text);
		if (textBlocks.length > 0) {
			return textBlocks.map((block) => block.text).join('\n');
		}
		// Fallback: try to extract any text content
		return output
			.map((item) => item?.text || item?.content || '')
			.filter(Boolean)
			.join('\n');
	}

	// If output is an object, try to extract text content
	if (output && typeof output === 'object') {
		// Try common text fields
		if (output.text) return output.text;
		if (output.content) {
			if (typeof output.content === 'string') return output.content;
			if (Array.isArray(output.content)) {
				return extractCleanOutput(output.content);
			}
		}
		if (output.message) return extractCleanOutput(output.message);
	}

	// Fallback: convert to string
	return String(output || '');
}

/* -----------------------------------------------------------
   Main Executor Function
----------------------------------------------------------- */
/**
 * The main executor method for the Tools Agent.
 *
 * This function retrieves necessary components (model, memory, tools), prepares the prompt,
 * creates the agent, and processes each input item. The error handling for each item is also
 * managed here based on the node's continueOnFail setting.
 *
 * @returns The array of execution data for all processed items
 */
export async function toolsAgentExecute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
	this.logger.debug('Executing Tools Agent V2');

	const returnData: INodeExecutionData[] = [];
	const items = this.getInputData();
	const outputParser = await getOptionalOutputParser(this);
	const tools = await getTools(this, outputParser);
	const batchSize = this.getNodeParameter('options.batching.batchSize', 0, 1) as number;
	const delayBetweenBatches = this.getNodeParameter(
		'options.batching.delayBetweenBatches',
		0,
		0,
	) as number;
	const memory = await getOptionalMemory(this);
	const model = await getChatModel(this);

	for (let i = 0; i < items.length; i += batchSize) {
		const batch = items.slice(i, i + batchSize);
		const batchPromises = batch.map(async (_item, batchItemIndex) => {
			const itemIndex = i + batchItemIndex;

			const input = getPromptInputByType({
				ctx: this,
				i: itemIndex,
				inputKey: 'text',
				promptTypeKey: 'promptType',
			});
			if (input === undefined) {
				throw new NodeOperationError(this.getNode(), 'The “text” parameter is empty.');
			}

			const options = this.getNodeParameter('options', itemIndex, {}) as {
				systemMessage?: string;
				maxIterations?: number;
				returnIntermediateSteps?: boolean;
				passthroughBinaryImages?: boolean;
				includeRawData?: boolean;
			};

			// Prepare the prompt messages and prompt template.
			const messages = await prepareMessages(this, itemIndex, {
				systemMessage: options.systemMessage,
				passthroughBinaryImages: options.passthroughBinaryImages ?? true,
				outputParser,
			});
			const prompt: ChatPromptTemplate = preparePrompt(messages);

			// Storage for raw LLM data if needed
			let rawLLMData: any[] = [];

			// Create the base agent that calls tools.
			const agent = createToolCallingAgent({
				llm: model,
				tools,
				prompt,
				streamRunnable: false,
			});
			agent.streamRunnable = false;
			// Wrap the agent with parsers and fixes.
			const runnableAgent = RunnableSequence.from([
				agent,
				getAgentStepsParser(outputParser, memory),
				fixEmptyContentMessage,
			]);
			const executor = AgentExecutor.fromAgentAndTools({
				agent: runnableAgent,
				memory,
				tools,
				returnIntermediateSteps: options.returnIntermediateSteps === true,
				maxIterations: options.maxIterations ?? 10,
			});

			// Add simple raw data collection callback if needed
			const invokeOptions: any = { signal: this.getExecutionCancelSignal() };

			if (options.includeRawData) {
				// Simple callback to collect raw LLM data
				invokeOptions.callbacks = [
					{
						handleLLMEnd: async (output: any, runId: string) => {
							const rawData = {
								runId,
								timestamp: new Date().toISOString(),
								generations: output.generations || [],
								llmOutput: output.llmOutput || {},
								usage: {
									// Try to extract usage from different possible locations
									anthropic: output.generations?.[0]?.[0]?.message?.kwargs?.usage_metadata,
									langchain: output.llmOutput?.tokenUsage,
									response_metadata:
										output.generations?.[0]?.[0]?.message?.kwargs?.response_metadata,
								},
							};
							rawLLMData.push(rawData);
							console.log('📊 Raw LLM Data Collected:', { runId, totalCalls: rawLLMData.length });
						},
					},
				];
			}

			// Invoke the executor with the given input and system message.
			const executorResult = await executor.invoke(
				{
					input,
					system_message: options.systemMessage ?? SYSTEM_MESSAGE,
					formatting_instructions:
						'IMPORTANT: For your response to user, you MUST use the `format_final_json_response` tool with your complete answer formatted according to the required schema. Do not attempt to format the JSON manually - always use this tool. Your response will be rejected if it is not properly formatted through this tool. Only use this tool once you are ready to provide your final answer.',
				},
				invokeOptions,
			);

			// Attach raw data to result if collected
			if (options.includeRawData && rawLLMData.length > 0) {
				(executorResult as any)._n8nRawLLMData = rawLLMData;
			}

			return executorResult;
		});

		const batchResults = await Promise.allSettled(batchPromises);

		batchResults.forEach((result, index) => {
			const itemIndex = i + index;
			if (result.status === 'rejected') {
				const error = result.reason as Error;
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: error.message },
						pairedItem: { item: itemIndex },
					});
					return;
				} else {
					throw new NodeOperationError(this.getNode(), error);
				}
			}

			const response = result.value;
			const rawLLMData = (response as any)._n8nRawLLMData || [];

			// If memory and outputParser are connected, parse the output.
			if (memory && outputParser) {
				const parsedOutput = jsonParse<{ output: Record<string, unknown> }>(
					response.output as string,
				);
				response.output = parsedOutput?.output ?? parsedOutput;
			}

			// Prepare the final result
			const responseData = omit(
				response,
				'system_message',
				'formatting_instructions',
				'input',
				'chat_history',
				'agent_scratchpad',
				'_n8nRawLLMData', // Remove this internal field
			);

			// Check if we need to include raw data for this specific item
			const currentItemOptions = this.getNodeParameter('options', itemIndex, {}) as {
				includeRawData?: boolean;
			};

			// Start with the base response data
			let finalOutput = {
				...responseData,
			};

			// Clean up the output field if it's complex Anthropic structure
			finalOutput.output = extractCleanOutput(responseData.output);

			// Add real raw data if enabled and available
			if (currentItemOptions.includeRawData) {
				if (rawLLMData.length > 0) {
					console.log(
						'🔍 Processing',
						rawLLMData.length,
						'raw LLM data entries for item:',
						itemIndex,
					);

					// Calculate total token usage
					const totalTokenUsage = rawLLMData.reduce(
						(acc: any, call: any) => {
							const anthropicUsage = call.usage?.anthropic || {};
							const langchainUsage = call.usage?.langchain || {};
							const responseMetadata = call.usage?.response_metadata?.usage || {};

							return {
								inputTokens:
									(acc.inputTokens || 0) +
									(anthropicUsage.input_tokens ||
										langchainUsage.promptTokens ||
										responseMetadata.input_tokens ||
										0),
								outputTokens:
									(acc.outputTokens || 0) +
									(anthropicUsage.output_tokens ||
										langchainUsage.completionTokens ||
										responseMetadata.output_tokens ||
										0),
								totalTokens:
									(acc.totalTokens || 0) +
									(anthropicUsage.total_tokens ||
										langchainUsage.totalTokens ||
										responseMetadata.total_tokens ||
										0),
								cacheCreation:
									(acc.cacheCreation || 0) +
									(anthropicUsage.input_token_details?.cache_creation ||
										responseMetadata.cache_creation_input_tokens ||
										0),
								cacheRead:
									(acc.cacheRead || 0) +
									(anthropicUsage.input_token_details?.cache_read ||
										responseMetadata.cache_read_input_tokens ||
										0),
							};
						},
						{
							inputTokens: 0,
							outputTokens: 0,
							totalTokens: 0,
							cacheCreation: 0,
							cacheRead: 0,
						},
					);

					finalOutput.rawData = {
						llmCalls: rawLLMData,
						summary: {
							totalCalls: rawLLMData.length,
							totalTokenUsage,
							executionTime: {
								start: rawLLMData[0]?.timestamp,
								end: rawLLMData[rawLLMData.length - 1]?.timestamp,
							},
						},
						metadata: {
							itemIndex,
							hasMemory: !!memory,
							hasOutputParser: !!outputParser,
							timestamp: new Date().toISOString(),
						},
					};
				} else {
					console.log('🔍 No raw LLM data collected for item:', itemIndex);
					finalOutput.rawData = {
						message: 'No raw LLM data was collected during execution',
						timestamp: new Date().toISOString(),
						itemIndex,
						hasMemory: !!memory,
						hasOutputParser: !!outputParser,
					};
				}
			}

			const itemResult = {
				json: finalOutput,
				pairedItem: { item: itemIndex },
			};

			returnData.push(itemResult);
		});

		if (i + batchSize < items.length && delayBetweenBatches > 0) {
			await sleep(delayBetweenBatches);
		}
	}

	return [returnData];
}
