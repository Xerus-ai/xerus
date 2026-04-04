// ACE (Agentic Context Engineering) Module
// Exports for playbook curator and reflection trigger

// ACE Playbook Curator (file-based, replaces DB-based AceContextLoader)
export { AcePlaybookCuratorService } from './ace-playbook-curator.service';

// ACE Reflection Trigger
export {
    ACEReflectionTrigger,
    createACEReflectionTrigger,
} from './ace-reflection.trigger';

// ACE Extractor (ReflectorService implementation)
export { AceExtractorService } from './ace-extractor.service';
export type { LLMClient, LLMMessage, AceExtractorConfig } from './ace-extractor.service';

export type {
    ACEReflectionTriggerParams,
    ACEReflectionTriggerResult,
    ACEReflectionTriggerDeps,
    ReflectorService,
    CuratorService,
    ReflectionRateLimiter,
    ReflectorAnalysis,
    CuratorChanges,
    CuratorPlaybookChange,
    QualityScores,
    ReflectorInsight,
    ReflectorError,
} from './ace-reflection.trigger';
