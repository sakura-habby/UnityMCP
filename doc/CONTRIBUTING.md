# Unity Development Best Practices

## Unity Editor Command Guidelines

### 1. Method Naming
- Always use fully qualified names for Unity methods (e.g., `GameObject.DestroyImmediate` instead of `DestroyImmediate`)

### 2. Pre-execution Steps
- Clear the console using `Debug.ClearDeveloperConsole()`
- Add a unique identifier in the first log message (e.g., timestamp or command ID)
- This ensures we can distinguish between current and previous execution logs

### 3. Error Checking
- Check `executionSuccess` flag in the result
- Look for errors in the current execution's errors array
- Verify logs match our execution by checking for our unique identifier

### 4. UI Element Handling
- Use `GetComponent<RectTransform>()` to ensure we get the RectTransform component
- Check if components exist before accessing them

### 5. Logging Best Practices
- Start with a unique identifier log
- Log important state changes and component findings
- Use appropriate log levels:
  - `Debug.Log` for normal flow
  - `Debug.LogWarning` for potential issues
  - `Debug.LogError` for failures

### 6. Finding GameObjects
- NEVER use `GameObject.Find()` to find potentially inactive objects as it only searches through active GameObjects
- Instead, use `transform.Find()` which can find both active and inactive children in the hierarchy
- When modifying inactive objects:
  1. Use `transform.Find()` to get the reference
  2. Temporarily activate it
  3. Make your changes
  4. Restore its original active state

## Unity Asset Management

### 1. Sprite Management
- Store sprites in appropriate folders (e.g., `Assets/[Feature]/Sprites/`)
- Configure sprite import settings properly:
  - Set appropriate pixels per unit
  - Choose correct filter mode (Point for pixel art, Bilinear for smooth graphics)
  - Set compression according to platform needs

### 2. Prefab Management
- When modifying prefabs:
  - Open the prefab for editing first
  - Make changes in prefab view
  - Save changes using `EditorUtility.SetDirty` and `AssetDatabase.SaveAssets`
- Provide fallback mechanisms when accessing prefab resources:
```csharp
// Example: Loading sprite with fallback
var sprite = Resources.Load<Sprite>("Path/To/Sprite");
if (sprite == null)
{
    // Fallback to reference from another component
    sprite = fallbackComponent.GetComponent<SpriteRenderer>()?.sprite;
}
```

## Example Usage

```csharp
// Clear previous logs and add unique identifier
Debug.ClearDeveloperConsole();
string commandId = System.DateTime.Now.Ticks.ToString();
Debug.Log($"Starting command execution [{commandId}]");

// Find and modify an object
var canvas = GameObject.Find("Canvas");
if (canvas != null) {
    Debug.Log($"[{commandId}] Found Canvas");
    var ui = canvas.transform.Find("UI");  // Can find inactive objects
    if (ui != null) {
        var rectTransform = ui.GetComponent<RectTransform>();
        if (rectTransform != null) {
            rectTransform.anchoredPosition = new Vector2(0, -50);
            Debug.Log($"[{commandId}] Updated UI position");
        }
    }
} else {
    Debug.LogError($"[{commandId}] Canvas not found in scene");
}
