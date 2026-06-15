import re
from pathlib import Path
from fastmcp import FastMCP

mcp = FastMCP("lorem")

_SOURCE = Path(__file__).parent / "lorem-ipsum.md"


def _get_words(word_count: int = 30) -> str:
    text = _SOURCE.read_text()
    # Strip markdown heading markers and collapse whitespace
    text = re.sub(r"#.*\n", "", text)
    words = text.split()
    return " ".join(words[:word_count])


@mcp.resource("lorem://words")
def resource_default() -> str:
    """Return the first 30 words from lorem-ipsum.md."""
    return _get_words(30)


@mcp.resource("lorem://words/{word_count}")
def resource_n_words(word_count: int) -> str:
    """Return the first word_count words from lorem-ipsum.md."""
    return _get_words(word_count)


@mcp.tool()
def read(word_count: int = 30) -> str:
    """Return the first word_count words from lorem-ipsum.md (default 30)."""
    return _get_words(word_count)


if __name__ == "__main__":
    mcp.run()
