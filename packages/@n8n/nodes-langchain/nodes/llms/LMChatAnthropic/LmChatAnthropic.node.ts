/* eslint-disable n8n-nodes-base/node-dirname-against-convention */

import { ChatAnthropic } from '@langchain/anthropic';
import type { LLMResult } from '@langchain/core/outputs';
import {
	NodeConnectionTypes,
	type INodePropertyOptions,
	type INodeProperties,
	type ISupplyDataFunctions,
	type INodeType,
	type INodeTypeDescription,
	type SupplyData,
} from 'n8n-workflow';

import { getHttpProxyAgent } from '@utils/httpProxyAgent';
import { getConnectionHintNoticeField } from '@utils/sharedFields';

import { searchModels } from './methods/searchModels';
import { makeN8nLlmFailedAttemptHandler } from '../n8nLlmFailedAttemptHandler';
import { N8nLlmTracing } from '../N8nLlmTracing';

const modelField: INodeProperties = {
	displayName: 'Model',
	name: 'model',
	type: 'options',
	// eslint-disable-next-line n8n-nodes-base/node-param-options-type-unsorted-items
	options: [
		{
			name: 'Claude 3.5 Sonnet(20241022)',
			value: 'claude-3-5-sonnet-20241022',
		},
		{
			name: 'Claude 3 Opus(20240229)',
			value: 'claude-3-opus-20240229',
		},
		{
			name: 'Claude 3.5 Sonnet(20240620)',
			value: 'claude-3-5-sonnet-20240620',
		},
		{
			name: 'Claude 3 Sonnet(20240229)',
			value: 'claude-3-sonnet-20240229',
		},
		{
			name: 'Claude 3.5 Haiku(20241022)',
			value: 'claude-3-5-haiku-20241022',
		},
		{
			name: 'Claude 3 Haiku(20240307)',
			value: 'claude-3-haiku-20240307',
		},
		{
			name: 'LEGACY: Claude 2',
			value: 'claude-2',
		},
		{
			name: 'LEGACY: Claude 2.1',
			value: 'claude-2.1',
		},
		{
			name: 'LEGACY: Claude Instant 1.2',
			value: 'claude-instant-1.2',
		},
		{
			name: 'LEGACY: Claude Instant 1',
			value: 'claude-instant-1',
		},
	],
	description:
		'The model which will generate the completion. <a href="https://docs.anthropic.com/claude/docs/models-overview">Learn more</a>.',
	default: 'claude-2',
};

const MIN_THINKING_BUDGET = 1024;
const DEFAULT_MAX_TOKENS = 4096;
export class LmChatAnthropic implements INodeType {
	methods = {
		listSearch: {
			searchModels,
		},
	};

	description: INodeTypeDescription = {
		displayName: 'Anthropic Chat Model',
		// eslint-disable-next-line n8n-nodes-base/node-class-description-name-miscased
		name: 'lmChatAnthropic',
		icon: 'file:anthropic.svg',
		group: ['transform'],
		version: [1, 1.1, 1.2, 1.3],
		defaultVersion: 1.3,
		description: 'Language Model Anthropic',
		defaults: {
			name: 'Anthropic Chat Model',
		},
		codex: {
			categories: ['AI'],
			subcategories: {
				AI: ['Language Models', 'Root Nodes'],
				'Language Models': ['Chat Models (Recommended)'],
			},
			resources: {
				primaryDocumentation: [
					{
						url: 'https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.lmchatanthropic/',
					},
				],
			},
			alias: ['claude', 'sonnet', 'opus', 'prompt caching', 'cache'],
		},
		// eslint-disable-next-line n8n-nodes-base/node-class-description-inputs-wrong-regular-node
		inputs: [],
		// eslint-disable-next-line n8n-nodes-base/node-class-description-outputs-wrong
		outputs: [NodeConnectionTypes.AiLanguageModel],
		outputNames: ['Model'],
		credentials: [
			{
				name: 'anthropicApi',
				required: true,
			},
		],
		properties: [
			getConnectionHintNoticeField([NodeConnectionTypes.AiChain, NodeConnectionTypes.AiChain]),
			{
				...modelField,
				displayOptions: {
					show: {
						'@version': [1],
					},
				},
			},
			{
				...modelField,
				default: 'claude-3-sonnet-20240229',
				displayOptions: {
					show: {
						'@version': [1.1],
					},
				},
			},
			{
				...modelField,
				default: 'claude-3-5-sonnet-20240620',
				options: (modelField.options ?? []).filter(
					(o): o is INodePropertyOptions => 'name' in o && !o.name.toString().startsWith('LEGACY'),
				),
				displayOptions: {
					show: {
						'@version': [{ _cnd: { lte: 1.2 } }],
					},
				},
			},
			{
				displayName: 'Model',
				name: 'model',
				type: 'resourceLocator',
				default: {
					mode: 'list',
					value: 'claude-sonnet-4-20250514',
					cachedResultName: 'Claude 4 Sonnet',
				},
				required: true,
				modes: [
					{
						displayName: 'From List',
						name: 'list',
						type: 'list',
						placeholder: 'Select a model...',
						typeOptions: {
							searchListMethod: 'searchModels',
							searchable: true,
						},
					},
					{
						displayName: 'ID',
						name: 'id',
						type: 'string',
						placeholder: 'Claude Sonnet',
					},
				],
				description:
					'The model. Choose from the list, or specify an ID. <a href="https://docs.anthropic.com/claude/docs/models-overview">Learn more</a>.',
				displayOptions: {
					show: {
						'@version': [{ _cnd: { gte: 1.3 } }],
					},
				},
			},
			{
				displayName: 'Options',
				name: 'options',
				placeholder: 'Add Option',
				description: 'Additional options to add',
				type: 'collection',
				default: {},
				options: [
					{
						displayName: 'Maximum Number of Tokens',
						name: 'maxTokensToSample',
						default: DEFAULT_MAX_TOKENS,
						description: 'The maximum number of tokens to generate in the completion',
						type: 'number',
					},
					{
						displayName: 'Sampling Temperature',
						name: 'temperature',
						default: 0.7,
						typeOptions: { maxValue: 1, minValue: 0, numberPrecision: 1 },
						description:
							'Controls randomness: Lowering results in less random completions. As the temperature approaches zero, the model will become deterministic and repetitive.',
						type: 'number',
						displayOptions: {
							hide: {
								thinking: [true],
							},
						},
					},
					{
						displayName: 'Top K',
						name: 'topK',
						default: -1,
						typeOptions: { maxValue: 1, minValue: -1, numberPrecision: 1 },
						description:
							'Used to remove "long tail" low probability responses. Defaults to -1, which disables it.',
						type: 'number',
						displayOptions: {
							hide: {
								thinking: [true],
							},
						},
					},
					{
						displayName: 'Top P',
						name: 'topP',
						default: 1,
						typeOptions: { maxValue: 1, minValue: 0, numberPrecision: 1 },
						description:
							'Controls diversity via nucleus sampling: 0.5 means half of all likelihood-weighted options are considered. We generally recommend altering this or temperature but not both.',
						type: 'number',
						displayOptions: {
							hide: {
								thinking: [true],
							},
						},
					},
					{
						displayName: 'Enable Thinking',
						name: 'thinking',
						type: 'boolean',
						default: false,
						description: 'Whether to enable thinking mode for the model',
					},
					{
						displayName: 'Thinking Budget (Tokens)',
						name: 'thinkingBudget',
						type: 'number',
						default: MIN_THINKING_BUDGET,
						description: 'The maximum number of tokens to use for thinking',
						displayOptions: {
							show: {
								thinking: [true],
							},
						},
					},
					{
						displayName: 'Prompt Caching',
						name: 'promptCaching',
						type: 'collection',
						default: {},
						placeholder: 'Add Caching Option',
						description: 'Configure prompt caching to reduce costs for repetitive requests',
						options: [
							{
								displayName: 'Enable System Message Caching',
								name: 'cacheSystemMessage',
								type: 'boolean',
								default: false,
								description:
									'Cache system messages to reduce costs for repetitive requests with same system prompt',
							},
							{
								displayName: 'Enable Tools Caching',
								name: 'cacheTools',
								type: 'boolean',
								default: false,
								description:
									'Cache tool definitions to reduce costs when using the same tools repeatedly',
							},
							{
								displayName: 'Enable Message History Caching',
								name: 'cacheMessages',
								type: 'boolean',
								default: false,
								description:
									'Cache conversation history to reduce costs in multi-turn conversations',
							},
							{
								displayName: 'Enable Request Logging',
								name: 'enableRequestLogging',
								type: 'boolean',
								default: false,
								description: 'Log outgoing requests to console for debugging cache behavior',
							},
						],
					},
				],
			},
		],
	};

	async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
		const credentials = await this.getCredentials<{ url?: string; apiKey?: string }>(
			'anthropicApi',
		);
		const baseURL = credentials.url ?? 'https://api.anthropic.com';
		const version = this.getNode().typeVersion;
		const modelName =
			version >= 1.3
				? (this.getNodeParameter('model.value', itemIndex) as string)
				: (this.getNodeParameter('model', itemIndex) as string);

		const options = this.getNodeParameter('options', itemIndex, {}) as {
			maxTokensToSample?: number;
			temperature: number;
			topK?: number;
			topP?: number;
			thinking?: boolean;
			thinkingBudget?: number;
		};

		const promptCaching = this.getNodeParameter('options.promptCaching', itemIndex, {}) as {
			cacheSystemMessage?: boolean;
			cacheTools?: boolean;
			cacheMessages?: boolean;
			enableRequestLogging?: boolean;
		};

		let invocationKwargs = {};

		const tokensUsageParser = (llmOutput: LLMResult['llmOutput']) => {
			if (promptCaching.enableRequestLogging) {
				console.log('🔍 Raw LLM Output Structure:', {
					llmOutput: llmOutput,
					usage: llmOutput?.usage,
					tokenUsage: llmOutput?.tokenUsage,
					usageMetadata: llmOutput?.usage_metadata,
					usageKeys: llmOutput?.usage ? Object.keys(llmOutput.usage) : 'no usage',
					tokenUsageKeys: llmOutput?.tokenUsage
						? Object.keys(llmOutput.tokenUsage)
						: 'no tokenUsage',
					usageMetadataKeys: llmOutput?.usage_metadata
						? Object.keys(llmOutput.usage_metadata)
						: 'no usage_metadata',
					fullStructure: JSON.stringify(llmOutput, null, 2).substring(0, 800),
				});
			}

			// Try to get usage from all possible locations and formats
			const anthropicUsage = llmOutput?.usage as {
				input_tokens?: number;
				output_tokens?: number;
				cache_creation_input_tokens?: number;
				cache_read_input_tokens?: number;
				cache_creation?: number; // Alternative format
				cache_read?: number; // Alternative format
			};

			const langchainUsage = llmOutput?.tokenUsage as {
				promptTokens?: number;
				completionTokens?: number;
				totalTokens?: number;
			};

			const usageMetadata = llmOutput?.usage_metadata as {
				input_tokens?: number;
				output_tokens?: number;
				total_tokens?: number;
				cache_creation_input_tokens?: number;
				cache_read_input_tokens?: number;
			};

			// Use the best available data source
			const usage = {
				input_tokens:
					usageMetadata?.input_tokens ||
					anthropicUsage?.input_tokens ||
					langchainUsage?.promptTokens ||
					0,
				output_tokens:
					usageMetadata?.output_tokens ||
					anthropicUsage?.output_tokens ||
					langchainUsage?.completionTokens ||
					0,
				cache_creation_input_tokens:
					usageMetadata?.cache_creation_input_tokens ||
					anthropicUsage?.cache_creation_input_tokens ||
					anthropicUsage?.cache_creation ||
					0,
				cache_read_input_tokens:
					usageMetadata?.cache_read_input_tokens ||
					anthropicUsage?.cache_read_input_tokens ||
					anthropicUsage?.cache_read ||
					0,
			};

			// Log cache usage if request logging is enabled
			if (promptCaching.enableRequestLogging) {
				const cacheCreation = usage.cache_creation_input_tokens || 0;
				const cacheRead = usage.cache_read_input_tokens || 0;
				const regularInput = usage.input_tokens;
				const totalSavings = cacheRead * 0.9; // 90% savings on cache reads

				console.log('💰 Anthropic Token Usage:', {
					input_tokens: regularInput,
					output_tokens: usage.output_tokens,
					cache_creation_tokens: cacheCreation,
					cache_read_tokens: cacheRead,
					total_tokens: regularInput + usage.output_tokens,
					cache_status:
						cacheCreation > 0 ? '🆕 Cache Created' : cacheRead > 0 ? '🎯 Cache Hit' : '❌ No Cache',
					estimated_savings: cacheRead > 0 ? `~${totalSavings.toFixed(0)} tokens saved` : 'none',
					data_source: usageMetadata?.input_tokens
						? 'usage_metadata'
						: anthropicUsage?.input_tokens
							? 'anthropic_usage'
							: langchainUsage?.promptTokens
								? 'langchain_usage'
								: 'unknown',
				});

				// Enhanced warnings
				if (regularInput === 0) {
					console.log('⚠️  WARNING: 0 input tokens detected. Possible issues:');
					console.log('   1. Proxy API (api.vveai.com) may not return correct token counts');
					console.log('   2. Model name "claude-3-7-sonnet-20250219" may be non-standard');
					console.log('   3. Try using standard model names like "claude-3-5-sonnet-20241022"');
					console.log('   4. Consider testing with official API (api.anthropic.com) if possible');
				}

				if (
					cacheCreation === 0 &&
					cacheRead === 0 &&
					(promptCaching.cacheSystemMessage || promptCaching.cacheMessages)
				) {
					console.log('⚠️  WARNING: No cache activity detected despite enabled caching');
					console.log(
						'   - Cache markers were added to messages, but API may not support prompt caching',
					);
					console.log(
						"   - This is common with proxy APIs that don't implement all Anthropic features",
					);
				}
			}

			return {
				completionTokens: usage.output_tokens,
				promptTokens: usage.input_tokens,
				totalTokens: usage.input_tokens + usage.output_tokens,
			};
		};

		if (options.thinking) {
			invocationKwargs = {
				thinking: {
					type: 'enabled',
					// If thinking is enabled, we need to set a budget.
					// We fallback to 1024 as that is the minimum
					budget_tokens: options.thinkingBudget ?? MIN_THINKING_BUDGET,
				},
				// The default Langchain max_tokens is -1 (no limit) but Anthropic requires a number
				// higher than budget_tokens
				max_tokens: options.maxTokensToSample ?? DEFAULT_MAX_TOKENS,
				// These need to be unset when thinking is enabled.
				// Because the invocationKwargs will override the model options
				// we can pass options to the model and then override them here
				top_k: undefined,
				top_p: undefined,
				temperature: undefined,
			};
		}

		// Create custom callbacks array for logging
		const callbacks = [new N8nLlmTracing(this, { tokensUsageParser })];

		// Create cache handling callback - THIS SHOULD ALWAYS BE ADDED WHEN CACHING IS ENABLED
		const cacheCallback = {
			handleChatModelStart: async (llm: any, messages: any[][], runId: string) => {
				if (promptCaching.enableRequestLogging) {
					console.log('💬 Chat Model Start - FOUND THE MESSAGES!:', {
						runId,
						messageGroupCount: messages.length,
						firstGroupLength: messages[0]?.length || 0,
						allMessages: messages.flat().map((msg: any, index: number) => ({
							index,
							type: msg?.type || msg?.role || msg?._getType?.() || 'unknown',
							contentType: Array.isArray(msg?.content) ? 'array' : typeof msg?.content,
							hasContent: !!msg?.content,
							contentSample:
								typeof msg?.content === 'string'
									? msg.content.substring(0, 100) + '...'
									: '[object/array]',
						})),
					});
				}

				// Apply caching to the messages - THIS RUNS REGARDLESS OF LOGGING SETTING
				if (messages && messages.length > 0 && Array.isArray(messages[0])) {
					const flatMessages = messages.flat();
					if (promptCaching.enableRequestLogging) {
						console.log('🎯 Applying cache control to chat messages...');
					}

					let cacheMarkersAdded = 0;
					const maxCacheMarkers = 4;

					// Strategy: Cache stable content that won't change between requests
					// 1. Always cache system message (index 0)
					// 2. Cache conversation at strategic points (last message and 3rd from last)
					// 3. Cache tool messages if enabled

					flatMessages.forEach((msg: any, index: number) => {
						if (cacheMarkersAdded >= maxCacheMarkers) return;

						const messageType = msg?.type || msg?.role || msg?._getType?.() || '';
						let shouldCache = false;
						let reason = '';

						// 1. System message caching - always cache the first system message
						if (
							promptCaching.cacheSystemMessage &&
							(messageType === 'system' || messageType === 'SystemMessage') &&
							index === 0
						) {
							shouldCache = true;
							reason = 'system message (index 0)';
						}
						// 2. Tool message caching
						else if (
							promptCaching.cacheTools &&
							(messageType === 'tool' || messageType === 'ToolMessage' || msg.tool_calls)
						) {
							shouldCache = true;
							reason = 'tool message';
						}
						// 3. Conversation history caching - cache last message and 3rd from last
						else if (promptCaching.cacheMessages && cacheMarkersAdded < maxCacheMarkers - 1) {
							const isLastMessage = index === flatMessages.length - 1;
							const isThirdFromLast = index === flatMessages.length - 3;

							if (isLastMessage) {
								shouldCache = true;
								reason = `last message (index ${index})`;
							} else if (isThirdFromLast && flatMessages.length >= 3) {
								shouldCache = true;
								reason = `3rd from last message (index ${index})`;
							}
						}

						if (shouldCache && cacheMarkersAdded < maxCacheMarkers) {
							const success = addCacheControlToMessage(msg);
							if (success) {
								cacheMarkersAdded++;
								if (promptCaching.enableRequestLogging) {
									console.log(
										`💾 Added cache_control to ${reason} (marker ${cacheMarkersAdded}/${maxCacheMarkers})`,
									);

									// Debug: Show the actual message structure after adding cache_control
									console.log(`🔍 Message ${index} after cache_control added:`, {
										type: msg?.type || msg?.role,
										contentType: Array.isArray(msg.content) ? 'array' : typeof msg.content,
										contentStructure: Array.isArray(msg.content)
											? msg.content.map((block: any, i: number) => ({
													blockIndex: i,
													type: block?.type,
													hasCacheControl: !!block?.cache_control,
													cacheControlValue: block?.cache_control,
												}))
											: {
													hasCacheControl: !!msg.content?.cache_control,
													cacheControlValue: msg.content?.cache_control,
												},
									});
								}
							}
						}
					});

					if (promptCaching.enableRequestLogging) {
						console.log(
							`✅ Cache strategy applied: ${cacheMarkersAdded}/${maxCacheMarkers} cache markers added`,
						);

						// Final debug: Show the complete message structure that will be sent
						console.log('📤 Final Message Structure (first 3 messages):');
						flatMessages.slice(0, 3).forEach((msg, idx) => {
							console.log(`Message ${idx}:`, {
								type: msg?.type || msg?.role,
								contentPreview:
									typeof msg.content === 'string'
										? msg.content.substring(0, 50) + '...'
										: '[complex content]',
								contentStructure: Array.isArray(msg.content)
									? `Array[${msg.content.length}] with cache_control: ${msg.content.some((b: any) => b?.cache_control)}`
									: `${typeof msg.content} with cache_control: ${!!msg.content?.cache_control}`,
							});
						});

						console.log(`... (showing 3 of ${flatMessages.length} total messages)`);

						// Show actual cache_control values for debugging
						const messagesWithCache = flatMessages.filter((msg, idx) => {
							if (Array.isArray(msg.content)) {
								return msg.content.some((block: any) => block?.cache_control);
							} else if (msg.content?.cache_control) {
								return true;
							}
							return false;
						});

						console.log('🏷️  Messages with cache_control:', {
							count: messagesWithCache.length,
							indices: messagesWithCache.map((_, idx) =>
								flatMessages.findIndex((m) => m === messagesWithCache[idx]),
							),
							sampleCacheControl:
								messagesWithCache[0] && Array.isArray(messagesWithCache[0].content)
									? messagesWithCache[0].content.find((b: any) => b?.cache_control)?.cache_control
									: messagesWithCache[0]?.content?.cache_control,
						});
					}
				}
			},
		} as any;

		// Always add cache callback if any caching is enabled
		if (
			promptCaching.cacheSystemMessage ||
			promptCaching.cacheTools ||
			promptCaching.cacheMessages
		) {
			callbacks.push(cacheCallback);
		}

		// Add request logging callback if enabled
		if (promptCaching.enableRequestLogging) {
			callbacks.push({
				handleLLMStart: async (llm: any, prompts: string[], runId: string) => {
					console.log('🚀 Anthropic Request Start:', {
						runId,
						modelName,
						promptCount: prompts.length,
						cacheConfig: {
							systemMessage: promptCaching.cacheSystemMessage,
							tools: promptCaching.cacheTools,
							messages: promptCaching.cacheMessages,
						},
					});
				},
				handleLLMEnd: async (output: any, runId: string) => {
					console.log('✅ Anthropic Request End:', {
						runId,
						tokensUsed: output.llmOutput?.usage || 'unknown',
					});

					// Enhanced debugging for API response
					console.log('🔍 Full LLM Response Debug:', {
						hasLlmOutput: !!output.llmOutput,
						outputKeys: output ? Object.keys(output) : 'no output',
						llmOutputKeys: output.llmOutput ? Object.keys(output.llmOutput) : 'no llmOutput',
						generations: output.generations?.length || 0,
						firstGeneration: output.generations?.[0]
							? {
									text: output.generations[0].text?.substring(0, 100) + '...',
									keys: Object.keys(output.generations[0]),
								}
							: 'no generations',
					});
				},
			} as any);
		}

		const model = new ChatAnthropic({
			anthropicApiKey: credentials.apiKey,
			modelName,
			anthropicApiUrl: baseURL,
			maxTokens: options.maxTokensToSample,
			temperature: options.temperature,
			topK: options.topK,
			topP: options.topP,
			callbacks,
			onFailedAttempt: makeN8nLlmFailedAttemptHandler(this),
			invocationKwargs,
			clientOptions: {
				httpAgent: getHttpProxyAgent(),
			},
		});

		// Store caching configuration on the model instance for use by agents
		(model as any)._n8nCacheConfig = {
			cacheSystemMessage: promptCaching.cacheSystemMessage,
			cacheTools: promptCaching.cacheTools,
			cacheMessages: promptCaching.cacheMessages,
			enableRequestLogging: promptCaching.enableRequestLogging,
		};

		// Add simple request logging wrapper if enabled
		if (promptCaching.enableRequestLogging) {
			// Try to intercept multiple possible methods
			const methodsToTry = ['_generate', 'invoke', '_call', 'call', '_invoke'];
			let intercepted = false;

			for (const methodName of methodsToTry) {
				const originalMethod = (model as any)[methodName]?.bind(model);
				if (originalMethod) {
					console.log(`🔍 Found method to intercept: ${methodName}`);

					(model as any)[methodName] = async function (...args: any[]) {
						console.log(`📞 ${methodName.toUpperCase()} called with args:`, {
							argsCount: args.length,
							argTypes: args.map((arg, i) => `${i}: ${typeof arg}`),
							firstArgSample: args[0]
								? typeof args[0] === 'string'
									? args[0].substring(0, 100)
									: typeof args[0]
								: 'undefined',
						});

						// For _generate method, args[0] should be messages
						if (methodName === '_generate' && args[0] && Array.isArray(args[0])) {
							const messages = args[0];
							console.log('📋 Anthropic Raw Request Messages (BEFORE caching):', {
								messageCount: messages?.length || 0,
								messages:
									messages?.map((msg: any, index: number) => ({
										index,
										type: msg?.type || msg?.role || 'unknown',
										contentType: Array.isArray(msg?.content) ? 'array' : typeof msg?.content,
										hasContent: !!msg?.content,
										contentSample:
											typeof msg?.content === 'string'
												? msg.content.substring(0, 100) + '...'
												: '[object/array]',
										hasCacheControl: msg?.content?.some
											? msg.content.some((block: any) => block?.cache_control)
											: !!msg?.content?.cache_control,
									})) || [],
							});

							// Apply caching logic here
							const modifiedMessages = applyCacheControlToMessages(messages, promptCaching);
							args[0] = modifiedMessages;

							console.log('📋 Anthropic Raw Request Messages (AFTER caching):', {
								messageCount: modifiedMessages?.length || 0,
								cacheMarkersFound:
									modifiedMessages?.reduce((count: number, msg: any) => {
										if (Array.isArray(msg?.content)) {
											return (
												count + msg.content.filter((block: any) => block?.cache_control).length
											);
										} else if (msg?.content?.cache_control) {
											return count + 1;
										}
										return count;
									}, 0) || 0,
							});
						}
						// For invoke method, check if args contain messages in different structure
						else if (methodName === 'invoke' && args[0]) {
							console.log('📋 Invoke method called with:', {
								firstArg: typeof args[0],
								keys: args[0] && typeof args[0] === 'object' ? Object.keys(args[0]) : 'not object',
								isArray: Array.isArray(args[0]),
								argStructure: JSON.stringify(args[0], null, 2).substring(0, 500),
							});
						}

						const result = await originalMethod(...args);

						console.log('📬 Method Response:', {
							method: methodName,
							resultType: typeof result,
							hasLlmOutput: !!result?.llmOutput,
							tokensUsed: result?.llmOutput?.usage || result?.usage_metadata || 'unknown',
							cacheMetrics: {
								cacheCreation:
									result?.llmOutput?.usage?.cache_creation_input_tokens ||
									result?.usage_metadata?.cache_creation_input_tokens ||
									0,
								cacheRead:
									result?.llmOutput?.usage?.cache_read_input_tokens ||
									result?.usage_metadata?.cache_read_input_tokens ||
									0,
							},
						});

						return result;
					};
					intercepted = true;
				}
			}

			if (!intercepted) {
				console.log('⚠️ Warning: Could not find any methods to intercept');
				console.log(
					'🔍 Available methods on model:',
					Object.getOwnPropertyNames(model).filter(
						(name) => typeof (model as any)[name] === 'function',
					),
				);
			}
		}

		if (promptCaching.enableRequestLogging) {
			console.log('🔧 Anthropic Model Configured:', {
				modelName,
				baseURL,
				cacheConfig: (model as any)._n8nCacheConfig,
				hasGenerateMethod: !!(model as any)._generate,
			});
		}

		return {
			response: model,
		};
	}
}

/**
 * Applies cache_control markers to messages based on caching configuration.
 *
 * @param messages - The array of messages to process
 * @param cacheConfig - The caching configuration
 * @returns The modified messages with cache_control markers
 */
function applyCacheControlToMessages(messages: any[], cacheConfig: any): any[] {
	if (!messages || !Array.isArray(messages) || !cacheConfig) {
		return messages;
	}

	// Deep clone messages to avoid modifying the original
	const modifiedMessages = JSON.parse(JSON.stringify(messages));
	let cacheMarkersAdded = 0;
	const maxCacheMarkers = 4; // Anthropic limit

	if (cacheConfig.enableRequestLogging) {
		console.log('🎯 Starting cache control application:', {
			originalMessageCount: messages.length,
			cacheSystemMessage: cacheConfig.cacheSystemMessage,
			cacheTools: cacheConfig.cacheTools,
			cacheMessages: cacheConfig.cacheMessages,
		});
	}

	// Process messages in reverse order to add cache markers to the most recent content
	for (let i = modifiedMessages.length - 1; i >= 0 && cacheMarkersAdded < maxCacheMarkers; i--) {
		const message = modifiedMessages[i];

		if (!message || typeof message !== 'object') continue;

		const messageType = message.type || message.role || '';
		let shouldCache = false;
		let reason = '';

		// System message caching
		if (
			cacheConfig.cacheSystemMessage &&
			(messageType === 'system' || messageType === 'SystemMessage')
		) {
			shouldCache = true;
			reason = 'system message';
		}
		// Tool message caching
		else if (
			cacheConfig.cacheTools &&
			(messageType === 'tool' || messageType === 'ToolMessage' || message.tool_calls)
		) {
			shouldCache = true;
			reason = 'tool message';
		}
		// User/Human message caching
		else if (
			cacheConfig.cacheMessages &&
			(messageType === 'human' || messageType === 'HumanMessage' || messageType === 'user')
		) {
			// Cache recent user messages (last few)
			const isRecentUserMessage = i >= Math.max(0, modifiedMessages.length - 4);
			if (isRecentUserMessage) {
				shouldCache = true;
				reason = 'recent user message';
			}
		}

		if (shouldCache) {
			const success = addCacheControlToMessage(message);
			if (success) {
				cacheMarkersAdded++;
				if (cacheConfig.enableRequestLogging) {
					console.log(`💾 Added cache_control to message ${i}: ${reason} (${messageType})`);
				}
			}
		}
	}

	if (cacheConfig.enableRequestLogging) {
		console.log(`✅ Cache control application complete. Added ${cacheMarkersAdded} cache markers.`);
	}

	return modifiedMessages;
}

/**
 * Adds cache_control to a single message (helper function for callback).
 */
function addCacheControlToMessage(msg: any): boolean {
	if (!msg || !msg.content) {
		return false;
	}

	try {
		// Handle different content formats
		if (Array.isArray(msg.content)) {
			// Content is an array of content blocks - add to the last block
			const lastBlock = msg.content[msg.content.length - 1];
			if (lastBlock && typeof lastBlock === 'object') {
				lastBlock.cache_control = { type: 'ephemeral' };
				return true;
			}
		} else if (typeof msg.content === 'string') {
			// Content is a string - convert to content block format with cache_control
			msg.content = [
				{
					type: 'text',
					text: msg.content,
					cache_control: { type: 'ephemeral' },
				},
			];
			return true;
		} else if (typeof msg.content === 'object') {
			// Content is already an object - add cache_control directly
			msg.content.cache_control = { type: 'ephemeral' };
			return true;
		}
	} catch (error) {
		console.log('❌ Failed to add cache_control to message:', error);
	}

	return false;
}
