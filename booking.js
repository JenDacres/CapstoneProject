const viewEl = document.getElementById("calendar-view");
const labelEl = document.getElementById("current-label");
const yearEl = document.getElementById("calendar-year");

let viewMode = 'day';
let currentDate = new Date();
let isYearPickerOpen = false;
let yearPickerYear = currentDate.getFullYear();

const bookedSlots = {
  "2024-04-15": ["6:00", "8:00"],
  "2024-04-20": ["10:00"]
};

function setView(mode) {
  viewMode = mode;
  isYearPickerOpen = false;
  renderCalendar();
}

document.getElementById("prev-btn").onclick = () => {
  if (viewMode === "day") currentDate.setDate(currentDate.getDate() - 1);
  else if (viewMode === "week") currentDate.setDate(currentDate.getDate() - 7);
  else if (viewMode === "month") currentDate.setMonth(currentDate.getMonth() - 1);
  renderCalendar();
};

document.getElementById("next-btn").onclick = () => {
  if (viewMode === "day") currentDate.setDate(currentDate.getDate() + 1);
  else if (viewMode === "week") currentDate.setDate(currentDate.getDate() + 7);
  else if (viewMode === "month") currentDate.setMonth(currentDate.getMonth() + 1);
  renderCalendar();
};

function isDateInCurrentOrAllowedNextMonth(date) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const bookingYear = date.getFullYear();
  const bookingMonth = date.getMonth();

  if (bookingYear === currentYear && bookingMonth === currentMonth) {
    return true;
  }

  const lastDateOfCurrentMonth = new Date(currentYear, currentMonth + 1, 0);
  const daysRemaining = lastDateOfCurrentMonth.getDate() - now.getDate();

  return (
    bookingYear === currentYear &&
    bookingMonth === currentMonth + 1 &&
    daysRemaining <= 2
  );
}

function formatDate(date, options = {}) {
  return date.toLocaleDateString(undefined, options);
}

function toggleYearPicker() {
  isYearPickerOpen = !isYearPickerOpen;
  if (isYearPickerOpen) {
    yearPickerYear = currentDate.getFullYear();
    renderYearPicker();
  } else {
    renderCalendar();
  }
}

function goToToday() {
  currentDate = new Date();
  setView('day');
}

function renderCalendar() {
  viewEl.innerHTML = '';
  viewEl.classList.add("fade");
  yearEl.textContent = currentDate.getFullYear();

  const backBtn = `<button onclick="goToToday()" style="margin-left:10px;padding:4px 8px;font-size:12px;">Back to Today</button>`;

  if (!isDateInCurrentOrAllowedNextMonth(currentDate)) {
    labelEl.innerHTML = `${formatDate(currentDate, { month: 'long', year: 'numeric' })} ${backBtn}`;
    viewEl.innerHTML = `<div style="display:flex;justify-content:center;align-items:center;height:200px;font-weight:500;text-align:center;">
      ⛔ Booking is only available for the current month or within 2 days of month-end.
    </div>`;
    return;
  }

  if (!isToday(currentDate)) {
    labelEl.innerHTML = `${formatDate(currentDate, { weekday: 'long', month: 'short', day: 'numeric' })} ${backBtn}`;
  } else {
    labelEl.textContent = formatDate(currentDate, { weekday: 'long', month: 'short', day: 'numeric' });
  }

  if (viewMode === "day") {
    renderDayView(currentDate);
  } else if (viewMode === "week") {
    const start = new Date(currentDate);
    start.setDate(start.getDate() - start.getDay() + 1);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    labelEl.innerHTML = `Week of ${formatDate(start)} - ${formatDate(end)} ${backBtn}`;
    renderWeekView(start);
  } else if (viewMode === "month") {
    labelEl.innerHTML = `${formatDate(currentDate, { month: 'long', year: 'numeric' })} ${backBtn}`;
    renderMonthView(currentDate);
  }
}

function renderDayView(date) {
  if (!isDateInCurrentOrAllowedNextMonth(date)) {
    viewEl.innerHTML = `<div style="display:flex;justify-content:center;align-items:center;height:200px;font-weight:500;text-align:center;">
      ⛔ Booking only allowed for the current month or within 2 days of next month.
    </div>`;
    return;
  }

  const slots = generateSlotsForDay(date);
  slots.forEach(time => {
    const div = document.createElement("div");
    div.className = "slot";
    const dateKey = date.toISOString().split("T")[0];
    if (bookedSlots[dateKey] && bookedSlots[dateKey].includes(time)) {
      div.classList.add("booked");
      div.textContent = `${time} (Waitlist)`;
      div.onclick = () => alert("This slot is full. You've been added to the waitlist (Placeholder).");
    } else {
      div.textContent = time;
      div.onclick = () => openTrainerModal(dateKey, time);
    }
    viewEl.appendChild(div);
  });
}

function renderWeekView(startDate) {
  for (let i = 0; i < 7; i++) {
    const day = new Date(startDate);
    day.setDate(startDate.getDate() + i);
    const div = document.createElement("div");
    div.className = "slot";
    div.textContent = formatDate(day, { weekday: 'short', day: 'numeric' });

    if (isToday(day)) div.classList.add("today");

    if (isDateInCurrentOrAllowedNextMonth(day)) {
      div.onclick = () => {
        currentDate = day;
        setView('day');
      };
    } else {
      div.style.opacity = '0.5';
      div.style.cursor = 'not-allowed';
    }

    viewEl.appendChild(div);
  }
}

function renderMonthView(date) {
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();

  for (let d = 1; d <= daysInMonth; d++) {
    const day = new Date(date.getFullYear(), date.getMonth(), d);
    const div = document.createElement("div");
    div.className = "slot";
    div.textContent = formatDate(day, { day: 'numeric', weekday: 'short' });

    if (isToday(day)) div.classList.add("today");

    if (isDateInCurrentOrAllowedNextMonth(day)) {
      div.onclick = () => {
        currentDate = day;
        setView('day');
      };
    } else {
      div.style.opacity = '0.5';
      div.style.cursor = 'not-allowed';
    }

    viewEl.appendChild(div);
  }
}

function renderYearPicker() {
  viewEl.innerHTML = '';
  viewEl.classList.add("fade");
  yearEl.textContent = `${yearPickerYear}`;

  const header = document.createElement('div');
  header.className = 'year-header';

  const prevBtn = document.createElement('button');
  prevBtn.className = 'year-nav';
  prevBtn.textContent = '‹';
  prevBtn.onclick = () => {
    yearPickerYear--;
    renderYearPicker();
  };

  const yearTitle = document.createElement('h2');
  yearTitle.textContent = yearPickerYear;

  const nextBtn = document.createElement('button');
  nextBtn.className = 'year-nav';
  nextBtn.textContent = '›';
  nextBtn.onclick = () => {
    yearPickerYear++;
    renderYearPicker();
  };

  header.appendChild(prevBtn);
  header.appendChild(yearTitle);
  header.appendChild(nextBtn);
  viewEl.appendChild(header);

  const months = [
    "January", "February", "March", "April",
    "May", "June", "July", "August",
    "September", "October", "November", "December"
  ];

  const grid = document.createElement('div');
  grid.className = 'year-picker';

  months.forEach((month, i) => {
    const box = document.createElement('div');
    box.className = 'month-box';
    box.textContent = month;
    box.onclick = () => {
      currentDate.setFullYear(yearPickerYear);
      currentDate.setMonth(i);
      isYearPickerOpen = false;
      setView('month');
    };
    grid.appendChild(box);
  });

  viewEl.appendChild(grid);
}

function generateSlotsForDay(date) {
  const day = date.getDay();
  const slots = [];
  let start = 5, end = 23;

  if (day === 6) { start = 9; end = 22; }
  else if (day === 0) return [];

  for (let hour = start; hour < end; hour++) {
    slots.push(`${hour}:00`);
  }

  return slots;
}

function isToday(date) {
  const today = new Date();
  return today.toDateString() === date.toDateString();
}

renderCalendar();

let selectedDate = "";
let selectedTime = "";

// Trainer Modal
function openTrainerModal(date, time) {
  selectedDate = date;
  selectedTime = time;

  const modal = document.getElementById("trainerModal");
  modal.style.display = "block";
  modal.classList.remove("fade-out"); // Reset fade-out if it was applied

  document.getElementById("trainerSelect").innerHTML = '<option value="">-- Select Trainer --</option>';
  document.getElementById("trainerSelect").disabled = true;

  // Set a loading state or fetch trainers
  fetch("http://localhost:5000/trainers")
    .then(res => res.json())
    .then(trainers => {
      const dropdown = document.getElementById("trainerSelect");
      trainers.forEach(t => {
        const option = document.createElement("option");
        option.value = t.user_id;
        option.textContent = t.full_name;
        dropdown.appendChild(option);
      });
      dropdown.disabled = false;
    });
}


// Close modal when clicking outside of it
function closeTrainerModal() {
  const modal = document.getElementById("trainerModal");
  modal.classList.add("fade-out");

  setTimeout(() => {
    modal.style.display = "none";
    modal.classList.remove("fade-out");
  }, 300); // matches the CSS animation duration
}

function skipTrainer() {
  fetch(`http://localhost:5000/check-slot?date=${selectedDate}&time=${selectedTime}`)
    .then(res => res.json())
    .then(data => {
      if (data.full) {
        alert(`The slot on ${selectedDate} at ${selectedTime} is full. You've been added to the waitlist.`);
      } else {
        fetch("http://localhost:5000/book-slot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: selectedDate,
            time: selectedTime,
            trainerId: null
          })
        })
          .then(res => {
            if (res.ok) {
              alert(`You have successfully booked the slot on ${selectedDate} at ${selectedTime} without a trainer.`);
            } else {
              alert("Booking failed. Please try again.");
            }
          });
      }

      closeTrainerModal();
    });
}

function confirmTrainer() {
  if (!selectedTrainerId) {
    alert("Please select a trainer.");
    return;
  }

  fetch(`http://localhost:5000/check-slot?date=${selectedDate}&time=${selectedTime}`)
    .then(res => res.json())
    .then(data => {
      if (data.full) {
        alert(`The slot on ${selectedDate} at ${selectedTime} is full. You've been added to the waitlist.`);
      } else {
        fetch("http://localhost:5000/book-slot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: selectedDate,
            time: selectedTime,
            trainerId: selectedTrainerId
          })
        })
          .then(res => {
            if (res.ok) {
              alert(`You have successfully booked the slot on ${selectedDate} at ${selectedTime} with your selected trainer.`);
            } else {
              alert("Booking failed. Please try again.");
            }
          });
      }

      closeTrainerModal();
    });
}
