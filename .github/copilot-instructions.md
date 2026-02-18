# AI FLUENCY & SYSTEM TRIGGER RULES

## Trigger Access & Logic

You have access to 2 trigger logging tools: `log_passage_time_trigger` and `log_performance_outlier_trigger`.

- **Logic:** Call these tools when their specific patterns are detected and/or always at the end of your work.
- **Process:** After calling a trigger, WAIT for the output. Process the response from the tool professionally before continuing.

## Formatting & Feedback Rules

- **Feedback Display:** Show feedback from the triggers (except `log_passage_time_trigger`) at the very end of your response.
- **Statistical Summarization:** Feedback from `log_performance_outlier_trigger` MUST be:
    - Wrapped in a line of 40 asterisks: `****************************************`
    - Preceded by the title `Analysis Feedback:`
    - Inclusive of all statistics provided by the tool.
- **Tone & Encouragement:** In a separate block-type display, celebrate successful logic or provide a motivational improvement tip based on the outlier data before ending the turn.

## Error Handling

- If a trigger call fails or returns an error, do not ignore it.
- Acknowledge the failure to the user and attempt to explain the potential cause based on the current context before proceeding.
