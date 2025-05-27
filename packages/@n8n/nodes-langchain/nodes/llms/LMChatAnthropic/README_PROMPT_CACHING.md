# Anthropic Prompt Caching in n8n

这个功能为 n8n 中的 Anthropic Chat Model 节点添加了 prompt caching 支持，可以显著减少重复请求的成本。

## 功能概述

Prompt caching 允许 Anthropic Claude 缓存提示的某些部分，避免重复处理相同的内容。这对以下场景特别有用：

- 长系统提示词的重复使用
- 多轮对话中的历史消息缓存
- 相同工具定义的重复使用

## 成本效益

- **缓存写入**：基础价格的 125% (5分钟缓存)
- **缓存读取**：基础价格的 10%
- **适用场景**：重复性任务、长对话、固定系统指令

## 配置选项

### 1. 系统消息缓存 (Cache System Message)
- **开启条件**：当你有长的系统提示词需要重复使用时
- **缓存位置**：系统消息的末尾
- **适用场景**：固定角色设定、详细指令

### 2. 工具缓存 (Cache Tools)
- **开启条件**：当你在多个请求中使用相同的工具集时
- **缓存位置**：工具定义的末尾
- **适用场景**：重复使用的 API 调用、函数定义

### 3. 消息历史缓存 (Cache Messages)
- **开启条件**：在长对话中需要保持上下文时
- **缓存位置**：最后一个用户消息和倒数第二个用户消息
- **适用场景**：多轮对话、上下文相关任务

### 4. 请求日志 (Request Logging)
- **用途**：调试缓存行为，查看缓存命中情况
- **输出**：控制台日志，包含请求详情和缓存指标

## 使用示例

### 基本配置
1. 在 Anthropic Chat Model 节点中，展开 "Options" 部分
2. 展开 "Prompt Caching" 集合
3. 根据需要启用相应的缓存选项：
   - `Enable System Message Caching` - 缓存系统消息
   - `Enable Tools Caching` - 缓存工具定义  
   - `Enable Message History Caching` - 缓存对话历史
   - `Enable Request Logging` - 启用调试日志

### 推荐场景

#### 场景1：长系统提示词 + 重复任务
```
配置：
✅ Enable System Message Caching
❌ Enable Tools Caching  
❌ Enable Message History Caching
✅ Enable Request Logging (调试阶段)
```

#### 场景2：多轮对话 + 工具使用
```
配置：
✅ Enable System Message Caching
✅ Enable Tools Caching
✅ Enable Message History Caching  
✅ Enable Request Logging (调试阶段)
```

#### 场景3：API 集成 + 重复调用
```
配置：
❌ Enable System Message Caching
✅ Enable Tools Caching
❌ Enable Message History Caching
✅ Enable Request Logging (调试阶段)
```

## 调试和监控

启用 "Request Logging" 后，控制台会显示以下信息：

```
🔧 Anthropic Model Configured: { modelName, cacheConfig }
🚀 Anthropic Request Start: { runId, cacheConfig }
📋 Anthropic Raw Request Messages: { messageCount, messages }
📬 Anthropic Response: { tokensUsed, cacheMetrics }
💰 Anthropic Cache Usage: { cache_creation_tokens, cache_read_tokens }
✅ Anthropic Request End: { runId, tokensUsed }
```

## 注意事项

1. **最小缓存长度**：只有超过 1024 tokens 的内容才会被缓存
2. **缓存失效**：修改任何缓存内容都会导致缓存失效
3. **最大缓存标记**：每个请求最多支持 4 个缓存标记
4. **缓存生命周期**：默认 5 分钟，每次使用会刷新
5. **并发限制**：并发请求需要等待第一个响应开始后才能命中缓存

## 性能优化建议

1. **合理规划缓存策略**：根据实际使用场景选择合适的缓存选项
2. **监控缓存效果**：使用日志功能观察缓存命中率
3. **内容稳定性**：确保要缓存的内容相对稳定，避免频繁变化
4. **成本平衡**：评估缓存写入成本 vs 缓存读取节省的成本

## 疑难解答

### 问题：缓存没有命中
**解决方案**：
1. 检查内容是否完全一致（包括空格、换行）
2. 确认内容长度是否超过 1024 tokens
3. 查看日志中的缓存指标

### 问题：意外的高成本
**解决方案**：
1. 检查是否频繁触发缓存写入
2. 评估内容变化频率
3. 考虑关闭不必要的缓存选项

### 问题：缓存行为异常
**解决方案**：
1. 启用 Request Logging 查看详细信息
2. 检查消息格式是否符合预期
3. 确认 Anthropic API 版本兼容性 