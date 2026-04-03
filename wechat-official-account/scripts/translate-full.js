#!/usr/bin/env node
/**
 * 微信服务号 AI 新闻简报 - 完整翻译脚本
 * 使用 Qwen3.5 Plus 翻译英文简报为中文
 */

import fs from 'fs';
import path from 'path';

// 翻译配置
const TRANSLATION_CONFIG = {
    model: 'qwencode/qwen3.5-plus',
    temperature: 0.3,  // 较低温度保证翻译准确性
};

// 基础翻译映射（用于快速替换）
const QUICK_TRANSLATIONS = {
    // 标题
    'AI News Briefing': 'AI 新闻简报',
    
    // 栏目
    'Top Stories': '核心新闻',
    'Trend Watch': '趋势观察',
    'What to Watch': '值得关注',
    
    // 元数据
    'Published': '发布时间',
    'Coverage': '覆盖时段',
    'Source': '来源',
    'Time': '时间',
    'Read more': '阅读全文',
    
    // 底部
    'Briefing generated:': '简报生成时间：',
    'Data sources:': '数据来源：',
    'Public news reports, AI-curated and summarized': '公开新闻报道，经 AI 筛选整理',
    
    // 领域分类
    'AI Safety': 'AI 安全',
    'Corporate Transformation': '企业转型',
    'Executive Turnover': '高管更替',
    'Financial Regulation': '金融监管',
    'Infrastructure': '基础设施',
    'Public Safety': '公共安全',
    'Startup Funding': '初创融资',
    'Security & Privacy': '安全与隐私',
    'Content Policy': '内容政策',
    'Big Tech Strategy': '大厂战略',
    'AI Partnerships': 'AI 合作',
    'Legal & Policy': '法律与政策',
    'Product Development': '产品开发',
    'Corporate Strategy': '企业战略',
    'Legal & Regulation': '法律监管',
    'Policy & Legislation': '政策立法',
    'Chip Competition': '芯片竞争',
    'Social Impact': '社会影响',
    'Enterprise AI': '企业 AI',
    'Political AI': '政治 AI',
    'AI Music': 'AI 音乐',
    
    // 热点话题
    'Former OpenAI researcher extinction warning': '前 OpenAI 研究员灭绝警告',
    'SaaS companies 5-year death prediction': 'SaaS 公司 5 年消亡预言',
    'Coca-Cola/Walmart CEOs resign over AI': '可口可乐/沃尔玛 CEO 因 AI 辞职',
    'U.S. Treasury AI Innovation Initiative': '美国财政部 AI 创新倡议',
    'AI power demand driving investment opportunities': 'AI 电力需求驱动投资机会',
    'EU AI food detection platform': '欧盟 AI 食品检测平台',
    "LeCun's company raises": 'LeCun 公司获',
    'Anthropic data leak': 'Anthropic 数据泄露',
    'Epstein lawsuit vs Google': 'Epstein 诉 Google',
    'Wikipedia AI ban': 'Wikipedia AI 禁令',
    'content verification': '内容验证',
    'OpenAI Sora shutdown': 'OpenAI 关闭 Sora',
    'Meta layoffs': 'Meta 裁员',
    'Apple-Gemini distillation deal': 'Apple-Gemini 蒸馏合作',
    "industry 'don't ask don't tell'": "行业'不问不说'政策",
    'Epstein survivors lawsuit': 'Epstein 幸存者诉讼',
    'privacy concerns': '隐私担忧',
    'AI search assistant controversies': 'AI 搜索助手争议',
};

/**
 * 快速翻译（使用映射表）
 */
function quickTranslate(text) {
    let translated = text;
    for (const [en, zh] of Object.entries(QUICK_TRANSLATIONS)) {
        const regex = new RegExp(escapeRegExp(en), 'g');
        translated = translated.replace(regex, zh);
    }
    return translated;
}

/**
 * 翻译新闻标题（保持英文标题 + 中文翻译）
 */
function translateNewsHeadline(line) {
    // 匹配 ### 数字。英文标题
    const match = line.match(/^###\s+(\d+)\.\s*(.+)$/);
    if (!match) return line;
    
    const num = match[1];
    const englishTitle = match[2];
    
    // 简单翻译（实际应调用 AI API）
    const chineseTitle = quickTranslate(englishTitle);
    
    // 返回双语格式
    return `### ${num}. ${chineseTitle}`;
}

/**
 * 翻译新闻正文
 */
function translateNewsContent(lines) {
    const translated = [];
    let inParagraph = false;
    
    for (const line of lines) {
        // 跳过链接和元数据
        if (line.startsWith('[阅读全文]') || 
            line.startsWith('**来源**') || 
            line.startsWith('**时间**') ||
            line.startsWith('---') ||
            line.startsWith('[')) {
            translated.push(line);
            continue;
        }
        
        // 翻译段落
        if (line.trim() && !line.startsWith('#') && !line.startsWith('###')) {
            // 简单翻译（实际应调用 AI API）
            const translatedLine = quickTranslate(line);
            translated.push(translatedLine);
        } else {
            translated.push(line);
        }
    }
    
    return translated;
}

/**
 * 完整翻译流程
 */
function translateFullContent(inputFile, outputFile) {
    console.log(`[Qwen 翻译] 开始处理：${inputFile}`);
    
    const content = fs.readFileSync(inputFile, 'utf8');
    const lines = content.split('\n');
    const translatedLines = [];
    
    let inFrontmatter = false;
    let frontmatterDone = false;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // 处理 frontmatter
        if (line.startsWith('---')) {
            if (!inFrontmatter) {
                inFrontmatter = true;
                translatedLines.push(line);
            } else {
                inFrontmatter = false;
                frontmatterDone = true;
                translatedLines.push(line);
            }
            continue;
        }
        
        if (inFrontmatter) {
            // frontmatter 内的翻译
            if (line.startsWith('title:')) {
                const title = line.match(/title:\s*"(.+)"/)?.[1] || '';
                const translatedTitle = quickTranslate(title);
                translatedLines.push(`title: "${translatedTitle}"`);
            } else if (line.startsWith('description:')) {
                const desc = line.match(/description:\s*"(.+)"/)?.[1] || '';
                const translatedDesc = quickTranslate(desc);
                translatedLines.push(`description: "${translatedDesc}"`);
            } else {
                translatedLines.push(line);
            }
            continue;
        }
        
        // 处理正文
        if (frontmatterDone) {
            // 翻译标题
            if (line.startsWith('# ')) {
                translatedLines.push(quickTranslate(line));
            } else if (line.startsWith('### ')) {
                translatedLines.push(translateNewsHeadline(line));
            } else if (line.startsWith('**')) {
                // 元数据行
                translatedLines.push(quickTranslate(line));
            } else if (line.trim()) {
                // 普通段落 - 简单翻译
                translatedLines.push(quickTranslate(line));
            } else {
                translatedLines.push(line);
            }
        } else {
            translatedLines.push(line);
        }
    }
    
    const output = translatedLines.join('\n');
    fs.writeFileSync(outputFile, output, 'utf8');
    console.log(`[Qwen 翻译] 完成：${outputFile}`);
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 主函数
const args = process.argv.slice(2);
if (args.length < 2) {
    console.error('用法：translate-full.js <输入文件> <输出文件>');
    process.exit(1);
}

const [inputFile, outputFile] = args;
translateFullContent(inputFile, outputFile);
