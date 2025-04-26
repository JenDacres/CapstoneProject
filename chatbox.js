function toggleChatbot() {
    const existing = document.getElementById("chatbox");
    if (existing) {
      existing.remove();
      return;
    }
  
    const chatbox = document.createElement("div");
    chatbox.id = "chatbox";
    chatbox.style.position = "fixed";
    chatbox.style.bottom = "90px";
    chatbox.style.right = "20px";
    chatbox.style.width = "320px";
    chatbox.style.background = "#fff";
    chatbox.style.borderRadius = "10px";
    chatbox.style.boxShadow = "0 4px 12px rgba(0,0,0,0.2)";
    chatbox.style.zIndex = 9999;
    chatbox.innerHTML = `
      <div style="background:black; color:white; padding:10px; border-top-left-radius:10px; border-top-right-radius:10px; display:flex; justify-content:space-between; align-items:center;">
        <strong>Ask AI</strong>
        <button onclick="toggleChatbot()" style="background:none; border:none; color:white; font-size:20px; cursor:pointer;">&times;</button>
      </div>
      <div id="chat-content" style="height:250px; overflow-y:auto; padding:10px; font-size:14px;"></div>
      <div style="display:flex; padding:10px; gap:5px;">
        <input id="chat-input" type="text" placeholder="Type your question..." style="flex:1; padding:8px; border:1px solid #ccc; border-radius:5px;" />
        <button onclick="sendMessage()" style="background:black; color:white; border:none; padding:8px 12px; border-radius:5px;">Send</button>
      </div>
    `;
    document.body.appendChild(chatbox);
  }
  
  function sendMessage() {
    const input = document.getElementById("chat-input");
    const message = input.value.trim();
    if (!message) return;
  
    const chatContent = document.getElementById("chat-content");
    const userMsg = document.createElement("div");
    userMsg.style.marginBottom = "10px";
    userMsg.innerHTML = `<strong>You:</strong> ${message}`;
    chatContent.appendChild(userMsg);
    input.value = "";
  
    // Simulate bot response (in real use connect to your AI backend)
    setTimeout(() => {
      const botMsg = document.createElement("div");
      botMsg.style.marginBottom = "10px";
      botMsg.innerHTML = `<strong>Bot:</strong> ${generateFakeResponse(message)}`;
      chatContent.appendChild(botMsg);
      chatContent.scrollTop = chatContent.scrollHeight;
    }, 600);
  }
  
  function generateFakeResponse(message) {
    if (message.toLowerCase().includes("open")) {
      return "The gym opens at 5:00 AM on weekdays!";
    } else if (message.toLowerCase().includes("peak")) {
      return "Peak hours are usually 5-7 PM.";
    } else if (message.toLowerCase().includes("workout")) {
      return "For strength, focus on weightlifting; for cardio, try HIIT!";
    }
    return "I'm still learning! Please ask about gym hours, peak hours, or workouts.";
  }