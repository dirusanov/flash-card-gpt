/** The generation and both acceptance/repair passes must agree on what an example is. */
export const EXAMPLE_TARGET_POLICY = `First distinguish an expression from a complete sentence by its meaning and syntax,
not word count, whitespace, length, or writing system.
For a word, inflected form, fixed phrase or idiom (EXPRESSION), each example must contain
the exact visible study target, allowing ordinary capitalization differences.
For a complete sentence (SENTENCE), repeating the whole input in three different wrappers
is not useful practice. Give three distinct natural sentences illustrating its main
construction or expression in new situations. The original sentence may be one example;
the other examples need not contain the entire original sentence verbatim. They may
change participants, objects, tense, polarity and circumstances to practise that same
construction or expression. Do not demand paraphrases of the original event, its exact
meaning, or all of its clauses; that would defeat varied practice.
All examples must be relevant to the construction or expression actually present in the
study input; unrelated sentences in the same language are invalid.`;
