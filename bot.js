const TelegramBot = require('node-telegram-bot-api'); 
const { createClient } = require('@supabase/supabase-js'); 
 
// Подключение к Supabase через переменные окружения 
const supabase = createClient( 
  process.env.SUPABASE_URL,  
  process.env.SUPABASE_ANON_KEY 
); 
 
// Запуск бота в режиме Polling (Railway поддерживает постоянную работу) 
const token = process.env.TELEGRAM_BOT_TOKEN; 
const bot = new TelegramBot(token, { polling: true }); 
 
console.log('Бот успешно запущен на Railway!'); 
 
// Команда /start или /groups — показываем список групп из таблицы groups 
bot.onText(/\/start|\/groups/, async (msg) => { 
  const chatId = msg.chat.id; 
 
  try { 
    const { data: groups, error } = await supabase 
      .from('groups') 
      .select('id, name'); 
 
    if (error) { 
      await bot.sendMessage(chatId, "Ошибка при получении групп: " + error.message); 
    } else if (!groups || groups.length === 0) { 
      await bot.sendMessage(chatId, "В базе данных пока нет групп."); 
    } else { 
      const keyboard = groups.map(group => [{ 
        text: group.name, 
        callback_data: `group_${group.id}` 
      }]); 
 
      await bot.sendMessage(chatId, "Выберите вашу группу из базы данных:", { 
        reply_markup: { inline_keyboard: keyboard } 
      }); 
    } 
  } catch (err) { 
    console.error(err); 
    await bot.sendMessage(chatId, "Произошла непредвиденная ошибка."); 
  } 
}); 
 
// Обработка нажатия на инлайн-кнопку с группой 
bot.on('callback_query', async (query) => { 
  const chatId = query.message.chat.id; 
  const data = query.data; 
 
if (data.startsWith('group_')) { 
const groupId = data.replace('group_', ''); 
try { 
// Запрос расписания по внешнему ключу group_id 
const { data: schedule, error } = await supabase 
.from('schedule') 
.select('*') 
.eq('group_id', groupId); 
if (error || !schedule || schedule.length === 0) { 
await bot.sendMessage(chatId, "Для этой группы пока нет расписания."); 
} else { 
let messageText = `📅 Расписание:\n\n`; 
schedule.forEach(row => { 
messageText += `🔹 День: ${row.day_of_week} (Пара №${row.lesson_number})\n`; 
messageText += `📚 Предмет: ${row.subject}\n`; 
messageText += `👨‍🏫 Преподаватель: ${row.teacher}\n`; 
messageText += `🚪 Аудитория: ${row.classroom}\n\n`; 
}); 
await bot.sendMessage(chatId, messageText); 
} 
} catch (err) { 
console.error(err); 
await bot.sendMessage(chatId, "Ошибка при загрузке расписания."); 
} 
} 
});