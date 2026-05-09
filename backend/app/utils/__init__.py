class AgentError(Exception):
    pass


class SandboxError(AgentError):
    pass


class LLMError(AgentError):
    pass


class TaskTimeoutError(AgentError):
    pass
