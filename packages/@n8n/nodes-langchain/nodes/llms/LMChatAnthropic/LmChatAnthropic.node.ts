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

				// 完整的原始llmOutput - 用于计费分析
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

				// Cache status logging
				if (promptCaching.enableRequestLogging) {
					if (cacheCreation === 0 && cacheRead === 0) {
						console.log('🔧 Cache Status: No cache activity');
					} else {
						console.log('🔧 Cache Status: Active', { creation: cacheCreation, read: cacheRead });
					}
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

		// Add a backup cache callback in case the API interception doesn't work
		const backupCacheCallback = {
			handleChatModelStart: async (llm: any, messages: any[][], runId: string) => {
				if (promptCaching.enableRequestLogging) {
					console.log('🔄 Backup cache callback triggered:', {
						runId,
						messageArrays: messages.length,
					});
				}

				// Always apply cache control via backup since API interception failed
				if (messages && messages.length > 0 && Array.isArray(messages[0])) {
					const flatMessages = messages.flat();

					if (
						promptCaching.cacheSystemMessage ||
						promptCaching.cacheTools ||
						promptCaching.cacheMessages
					) {
						if (promptCaching.enableRequestLogging) {
							console.log('🎯 API interception failed, applying cache control via backup callback');
						}
						applyFinalCacheControl(flatMessages, promptCaching);
					}
				}
			},
		} as any;

		// Add backup callback if any caching is enabled
		if (
			promptCaching.cacheSystemMessage ||
			promptCaching.cacheTools ||
			promptCaching.cacheMessages
		) {
			callbacks.push(backupCacheCallback);
		}

		// Add request logging callback if enabled
		if (promptCaching.enableRequestLogging) {
			callbacks.push({
				handleLLMStart: async (llm: any, prompts: string[], runId: string) => {
					console.log('🚀 Anthropic Request Start:', {
						runId,
						modelName,
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

					// 完整的LangChain返回结果 - 用于计费分析
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

		// 尝试多种API拦截方法
		if (promptCaching.enableRequestLogging) {
			console.log('🔍 Attempting API interception...', {
				hasClient: !!(model as any).client,
				hasAnthropicApiKey: !!(model as any).anthropicApiKey,
				clientType: typeof (model as any).client,
				clientKeys: (model as any).client ? Object.keys((model as any).client) : 'no client',
			});
		}

		// 方法1: 尝试拦截 client.messages.create
		const originalClient = (model as any).client;
		if (originalClient && originalClient.messages && originalClient.messages.create) {
			const originalCreate = originalClient.messages.create.bind(originalClient.messages);
			originalClient.messages.create = async function (params: any) {
				if (promptCaching.enableRequestLogging) {
					console.log('🎯 API Interceptor (method 1) called');
				}

				// 应用缓存控制
				if (
					params.messages &&
					Array.isArray(params.messages) &&
					(promptCaching.cacheSystemMessage ||
						promptCaching.cacheTools ||
						promptCaching.cacheMessages)
				) {
					applyFinalCacheControl(params.messages, promptCaching);
				}

				const response = await originalCreate(params);
				return response;
			};

			if (promptCaching.enableRequestLogging) {
				console.log('✅ Successfully intercepted client.messages.create');
			}
		}
		// 方法2: 尝试拦截 client.beta.messages.create (如果存在)
		else if (
			originalClient &&
			originalClient.beta &&
			originalClient.beta.messages &&
			originalClient.beta.messages.create
		) {
			const originalCreate = originalClient.beta.messages.create.bind(originalClient.beta.messages);
			originalClient.beta.messages.create = async function (params: any) {
				if (promptCaching.enableRequestLogging) {
					console.log('🎯 API Interceptor (method 2) called');
				}

				// 应用缓存控制
				if (
					params.messages &&
					Array.isArray(params.messages) &&
					(promptCaching.cacheSystemMessage ||
						promptCaching.cacheTools ||
						promptCaching.cacheMessages)
				) {
					applyFinalCacheControl(params.messages, promptCaching);
				}

				const response = await originalCreate(params);
				return response;
			};

			if (promptCaching.enableRequestLogging) {
				console.log('✅ Successfully intercepted client.beta.messages.create');
			}
		}
		// 方法3: 尝试直接拦截创建函数
		else if (originalClient && typeof originalClient.create === 'function') {
			const originalCreate = originalClient.create.bind(originalClient);
			originalClient.create = async function (params: any) {
				if (promptCaching.enableRequestLogging) {
					console.log('🎯 API Interceptor (method 3) called');
				}

				// 应用缓存控制
				if (
					params.messages &&
					Array.isArray(params.messages) &&
					(promptCaching.cacheSystemMessage ||
						promptCaching.cacheTools ||
						promptCaching.cacheMessages)
				) {
					applyFinalCacheControl(params.messages, promptCaching);
				}

				const response = await originalCreate(params);
				return response;
			};

			if (promptCaching.enableRequestLogging) {
				console.log('✅ Successfully intercepted client.create');
			}
		} else {
			if (promptCaching.enableRequestLogging) {
				console.log('⚠️ Could not find any API endpoint to intercept, will rely on backup callback');
				if (originalClient) {
					console.log('🔍 Available client methods:', Object.getOwnPropertyNames(originalClient));
				}
			}
		}

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
					if (promptCaching.enableRequestLogging) {
						console.log(`🔍 Intercepting: ${methodName}`);
					}

					(model as any)[methodName] = async function (...args: any[]) {
						// For _generate method, args[0] should be messages
						if (methodName === '_generate' && args[0] && Array.isArray(args[0])) {
							const messages = args[0];

							if (promptCaching.enableRequestLogging) {
								console.log(`🔍 ${methodName} called with messages:`, {
									messageCount: messages.length,
									messagesWithCache: messages.filter((msg: any) => {
										if (Array.isArray(msg.content)) {
											return msg.content.some((block: any) => block.cache_control);
										}
										return msg.content?.cache_control;
									}).length,
								});

								// 显示前两条消息的详细结构
								messages.slice(0, 2).forEach((msg: any, index: number) => {
									console.log(`📨 Message ${index} structure:`, {
										type: msg.type || msg.role,
										contentType: Array.isArray(msg.content) ? 'array' : typeof msg.content,
										hasCache: Array.isArray(msg.content)
											? msg.content.some((block: any) => block.cache_control)
											: !!msg.content?.cache_control,
										firstContentBlock:
											Array.isArray(msg.content) && msg.content[0]
												? {
														type: msg.content[0].type,
														hasCache: !!msg.content[0].cache_control,
														textPreview: msg.content[0].text
															? msg.content[0].text.substring(0, 100) + '...'
															: 'no text',
													}
												: 'not array',
									});
								});
							}

							// Note: Cache control is already applied in handleChatModelStart callback
							// to avoid double application and exceeding the 4 cache block limit.
							// No need to apply caching logic here again.
						}
						// For invoke method, check if args contain messages in different structure

						const result = await originalMethod(...args);

						if (promptCaching.enableRequestLogging) {
							const cacheRead =
								result?.llmOutput?.usage?.cache_read_input_tokens ||
								result?.usage_metadata?.cache_read_input_tokens ||
								0;
							const cacheCreation =
								result?.llmOutput?.usage?.cache_creation_input_tokens ||
								result?.usage_metadata?.cache_creation_input_tokens ||
								0;

							console.log('📬 Response:', {
								method: methodName,
								tokens: result?.llmOutput?.usage || result?.usage_metadata || 'unknown',
								cache:
									cacheRead > 0 || cacheCreation > 0
										? { read: cacheRead, creation: cacheCreation }
										: 'none',
							});
						}

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
 * The final cache control application function - only called once before API request.
 * This function clears all existing cache controls and applies exactly the needed ones.
 *
 * @param messages - The array of messages to process (modified in place)
 * @param cacheConfig - The caching configuration
 */
function applyFinalCacheControl(messages: any[], cacheConfig: any): void {
	if (!messages || !Array.isArray(messages) || !cacheConfig) {
		if (cacheConfig?.enableRequestLogging) {
			console.log('⚠️ applyFinalCacheControl: Invalid parameters');
		}
		return;
	}

	if (cacheConfig.enableRequestLogging) {
		console.log('🔍 applyFinalCacheControl called:', {
			messageCount: messages.length,
			config: {
				systemMessage: cacheConfig.cacheSystemMessage,
				tools: cacheConfig.cacheTools,
				messages: cacheConfig.cacheMessages,
			},
		});
	}

	// Step 1: 清除所有现有的缓存控制
	let removedCacheBlocks = 0;
	messages.forEach((msg: any, index: number) => {
		if (msg.content) {
			if (Array.isArray(msg.content)) {
				msg.content.forEach((block: any) => {
					if (block.cache_control) {
						delete block.cache_control;
						removedCacheBlocks++;
					}
				});
			} else if (typeof msg.content === 'object' && msg.content.cache_control) {
				delete msg.content.cache_control;
				removedCacheBlocks++;
			}
		}
	});

	if (cacheConfig.enableRequestLogging) {
		console.log(`🧹 Cleaned ${removedCacheBlocks} existing cache blocks`);
	}

	// Step 2: 重新应用最多4个缓存控制
	let cacheMarkersAdded = 0;
	const maxCacheMarkers = 4;
	const cacheTargets: number[] = [];

	// 1. 系统消息 - 最后一条系统消息
	if (cacheConfig.cacheSystemMessage) {
		for (let i = messages.length - 1; i >= 0; i--) {
			const messageType = messages[i]?.type || messages[i]?.role || '';
			if (messageType === 'system' || messageType === 'SystemMessage') {
				cacheTargets.push(i);
				if (cacheConfig.enableRequestLogging) {
					console.log(`🏷️ Found system message at index ${i}`);
				}
				break; // 只取最后一条系统消息
			}
		}
	}

	// 2. 工具消息 - 最后一条工具消息
	if (cacheConfig.cacheTools && cacheTargets.length < maxCacheMarkers) {
		for (let i = messages.length - 1; i >= 0; i--) {
			const messageType = messages[i]?.type || messages[i]?.role || '';
			if (messageType === 'tool' || messageType === 'ToolMessage' || messages[i]?.tool_calls) {
				if (!cacheTargets.includes(i)) {
					cacheTargets.push(i);
					if (cacheConfig.enableRequestLogging) {
						console.log(`🔧 Found tool message at index ${i}`);
					}
					break; // 只取最后一条工具消息
				}
			}
		}
	}

	// 3. 对话历史消息 - 最后一条和倒数第三条
	if (cacheConfig.cacheMessages) {
		// 最后一条消息
		if (cacheTargets.length < maxCacheMarkers && messages.length > 0) {
			const lastIndex = messages.length - 1;
			if (!cacheTargets.includes(lastIndex)) {
				cacheTargets.push(lastIndex);
				if (cacheConfig.enableRequestLogging) {
					console.log(`📝 Found last message at index ${lastIndex}`);
				}
			}
		}

		// 倒数第三条消息
		if (cacheTargets.length < maxCacheMarkers && messages.length >= 3) {
			const thirdFromLastIndex = messages.length - 3;
			if (!cacheTargets.includes(thirdFromLastIndex)) {
				cacheTargets.push(thirdFromLastIndex);
				if (cacheConfig.enableRequestLogging) {
					console.log(`📝 Found third-from-last message at index ${thirdFromLastIndex}`);
				}
			}
		}
	}

	// Step 3: 应用缓存标记
	cacheTargets.forEach((index) => {
		if (cacheMarkersAdded < maxCacheMarkers) {
			const success = addCacheControlToMessage(messages[index]);
			if (success) {
				cacheMarkersAdded++;
				if (cacheConfig.enableRequestLogging) {
					console.log(`✅ Added cache control to message ${index}`);
				}
			} else if (cacheConfig.enableRequestLogging) {
				console.log(`❌ Failed to add cache control to message ${index}`);
			}
		}
	});

	if (cacheConfig.enableRequestLogging) {
		console.log(
			`💾 Final cache control applied: ${cacheMarkersAdded}/${maxCacheMarkers} cache markers added to indices: [${cacheTargets.join(', ')}]`,
		);

		// 显示实际的消息结构用于调试
		console.log('🔍 Final message structure with cache control:');
		messages.forEach((msg, index) => {
			const hasCache = Array.isArray(msg.content)
				? msg.content.some((block: any) => block.cache_control)
				: msg.content?.cache_control;

			if (hasCache) {
				console.log(`📋 Message ${index} (${msg.type || msg.role}):`, {
					contentType: Array.isArray(msg.content) ? 'array' : typeof msg.content,
					contentLength: Array.isArray(msg.content)
						? msg.content.length
						: typeof msg.content === 'string'
							? msg.content.length
							: 'object',
					hasCache: hasCache,
					content: Array.isArray(msg.content)
						? msg.content.map((block: any) => ({
								type: block.type,
								hasCache: !!block.cache_control,
								textLength: block.text ? block.text.length : 'no text',
							}))
						: {
								hasCache: !!msg.content?.cache_control,
								textLength: typeof msg.content === 'string' ? msg.content.length : 'object',
							},
				});
			}
		});
	}
}

/**
 * Adds cache_control to a single message.
 * This function assumes all existing cache controls have been cleared.
 */
function addCacheControlToMessage(msg: any): boolean {
	if (!msg || !msg.content) {
		console.log('🔍 addCacheControlToMessage: Invalid message or content');
		return false;
	}

	console.log('🔍 addCacheControlToMessage: Processing message:', {
		contentType: Array.isArray(msg.content) ? 'array' : typeof msg.content,
		arrayLength: Array.isArray(msg.content) ? msg.content.length : 'not array',
		contentSample: Array.isArray(msg.content)
			? msg.content[0]
			: typeof msg.content === 'string'
				? msg.content.substring(0, 50) + '...'
				: 'object',
	});

	try {
		if (Array.isArray(msg.content)) {
			// Content is an array of content blocks - add to the last block
			const lastBlock = msg.content[msg.content.length - 1];
			if (lastBlock && typeof lastBlock === 'object') {
				lastBlock.cache_control = { type: 'ephemeral' };
				console.log('✅ Added cache_control to array content, last block:', {
					blockType: lastBlock.type,
					hasCache: !!lastBlock.cache_control,
					textLength: lastBlock.text ? lastBlock.text.length : 'no text',
				});
				return true;
			}
		} else if (typeof msg.content === 'string') {
			// Content is a string - convert to content block format with cache_control
			const originalLength = msg.content.length;
			msg.content = [
				{
					type: 'text',
					text: msg.content,
					cache_control: { type: 'ephemeral' },
				},
			];
			console.log('✅ Converted string content to array with cache_control:', {
				originalLength,
				newStructure: 'text block with cache_control',
			});
			return true;
		} else if (typeof msg.content === 'object') {
			// Content is already an object - add cache_control directly
			msg.content.cache_control = { type: 'ephemeral' };
			console.log('✅ Added cache_control to object content:', {
				hasText: !!msg.content.text,
				hasType: !!msg.content.type,
				hasCache: !!msg.content.cache_control,
			});
			return true;
		}
	} catch (error) {
		console.log('❌ Failed to add cache_control to message:', error);
	}

	console.log('❌ Could not add cache_control - unsupported content format');
	return false;
}
