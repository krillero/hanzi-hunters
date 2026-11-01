from pathlib import Path
import json,re,gzip,unicodedata,hashlib,copy,subprocess
ROOT=Path('/workspace/scratch/903ba6f88450');REPO=ROOT/'hanzi-beginner100';C=REPO/'src/content';OUT=ROOT/'beginner100-package';OUT.mkdir(exist_ok=True)
old=json.loads(subprocess.check_output(['git','show','HEAD:src/content/words.json'],cwd=REPO)); oldex=json.loads(subprocess.check_output(['git','show','HEAD:src/content/explanations.json'],cwd=REPO)); oldby={w.get('id',w['hanzi']):copy.deepcopy(w) for w in old}
# Each group of five is an explicitly ordered lesson. These are editorial notes, not dictionary quotations.
DATA='''你好|nǐ hǎo|hello|greetings|A common greeting. Both syllables are written with third tones; in ordinary speech the first changes to a rising tone: ní hǎo.
谢谢|xièxie|thank you|greetings|Use to thank someone. The second syllable is neutral and usually shorter and lighter than the first.
再见|zàijiàn|goodbye|greetings|A common way to say goodbye. Both syllables have fourth tones.
请|qǐng|please / invite|greetings|Before an action, 请 makes a polite request. 请坐 (qǐng zuò) means please sit down.
对不起|duìbuqǐ|sorry / excuse me|greetings|Use to apologize or politely get someone's attention. In this expression, bu is neutral; it is not the ordinary isolated reading bù.
我|wǒ|I / me|people|Use 我 for yourself. Chinese pronouns do not change form between I and me.
你|nǐ|you|people|The usual singular you. 您 (nín) is a more respectful form.
他|tā|he / him|people|Written 他 refers to he or him. It sounds exactly like 她 (she/her), so speech needs context.
她|tā|she / her|people|Written 她 refers to she or her. It sounds exactly like 他 (he/him); the 女 component helps distinguish the writing.
您|nín|you (polite)|people|A respectful singular form of you, often used with elders, customers, or someone you wish to address politely.
是|shì|be (identity)|grammar|Links a person or thing to an identity or category: 我是学生 means I am a student. It is not a general equivalent of English yes or the is before an adjective.
不|bù|not|grammar|Usually negates present or habitual actions and descriptions. Before a fourth-tone syllable it is normally pronounced bú. Negate 有 with 没有 instead.
吗|ma|marks a yes/no question|grammar|At the end of a statement, 吗 makes a yes/no question. This particle is neutral tone; do not add it automatically to questions already containing 什么 or 谁.
也|yě|also / too|grammar|Usually comes before the verb or adjective phrase. 我也去 means I am going too.
很|hěn|very|grammar|Often comes before an adjective. In an ordinary description it may simply make the sentence natural, without strongly emphasizing very.
叫|jiào|be called / call|questions|Use 我叫... to give your name. 叫 also means to call or shout in other contexts.
名字|míngzi|name|questions|Means a person's or thing's name. The second syllable, zi, is neutral.
谁|shéi|who|questions|Asks which person is meant. Shéi and shuí are both accepted pronunciations of this word.
什么|shénme|what|questions|Use to ask what something is or what someone does or wants. Me is neutral; 什么 stays where the answer would go in the sentence.
哪|nǎ|which|questions|Asks which one. 哪个 (nǎ ge) means which one; 哪 is different from 那 (nà, that).
一|yī|one|number|Yī is the dictionary reading and is used in counting. Before a fourth tone it normally becomes yí; before a first, second, or third tone it normally becomes yì.
二|èr|two (counting)|number|Use 二 when counting or reading digits. Before most classifiers, 两 is normally used instead: 两个人 means two people.
三|sān|three|number|First tone: high and level. 三个人 means three people.
四|sì|four|number|Fourth tone: a clear fall. 四 (sì) and 十 (shí, ten) have different initials and tones.
五|wǔ|five|number|Third tone. In ordinary speech a third tone is often low rather than a full dip and rise.
六|liù|six|number|Fourth tone. 六个人 means six people.
七|qī|seven|number|First tone. The pinyin initial q is different from the initial ch in 吃 (chī).
八|bā|eight|number|First tone. 八个人 means eight people.
九|jiǔ|nine|number|Third tone. 九 comes between 八 (eight) and 十 (ten) when counting.
十|shí|ten|number|十一 means eleven and 二十 means twenty. 十 and 石 (stone) are pronounced alike.
零|líng|zero|number|Use 零 for zero, including when reading digits in a phone number. It has a second tone.
个|gè|general classifier|grammar|A common counting word between a number and a noun: 三个人 means three people. Its dictionary tone is fourth; it is often neutral in phrases such as 一个 (yí ge).
两|liǎng|two (before classifiers)|number|Normally used before classifiers: 两个人 means two people. Use 二 for counting one, two, three and for most digit-by-digit numbers.
有|yǒu|have / there is|verbs|Expresses possession or existence. 我有书 means I have a book or books. Its usual negative is 没有, not 不有.
没有|méiyǒu|not have / there is no|verbs|Negates 有: 我没有书 means I do not have a book. It can also negate an action that has not happened; start with possession here.
人|rén|person / people|people|Can refer to a person or to people; the character itself does not mark singular or plural. 三个人 means three people.
朋友|péngyou|friend|people|An everyday word for friend. You is neutral in the pronunciation taught here.
家|jiā|home / family|place|Can mean home or family. 回家 means return home; 家 does not only refer to the physical building.
妈妈|māma|mom / mother|people|An everyday word for mother. The first syllable has first tone and the second is neutral.
爸爸|bàba|dad / father|people|An everyday word for father. The first syllable has fourth tone and the second is neutral.
哥哥|gēge|older brother|people|Refers to an older brother. Chinese distinguishes older and younger siblings; the second syllable is neutral.
姐姐|jiějie|older sister|people|Refers to an older sister. The second syllable is neutral.
弟弟|dìdi|younger brother|people|Refers to a younger brother. Compare 哥哥, older brother. The second syllable is neutral.
妹妹|mèimei|younger sister|people|Refers to a younger sister. Compare 姐姐, older sister. The second syllable is neutral.
孩子|háizi|child|people|The usual everyday word for a child or children. The second syllable is neutral; 子 alone is not the ordinary conversational substitute.
喜欢|xǐhuan|like / be fond of|feelings|Can be followed by a noun or an activity: 喜欢茶 means like tea; 喜欢看书 means like reading. Huan is neutral here.
想|xiǎng|think / want to|verbs|Before an action, 想 can express wanting to do it. 想喝茶 means want to drink tea. It can also mean think or miss someone.
要|yào|want / need|verbs|Expresses wanting or needing something. 我要茶 means I want tea; 想 often sounds softer when expressing a wish to do something.
吃|chī|eat|verbs|Use for eating. 吃饭 (chīfàn) means to eat or have a meal; it does not require the meal to contain rice.
喝|hē|drink|verbs|Use with drinks: 喝水 means drink water. The reading taught here is hē; 喝 has another reading in other uses.
水|shuǐ|water|food|喝水 means drink water. The final ui is written with the tone mark on i: shuǐ.
茶|chá|tea|food|喝茶 means drink tea. 茶 has a rising second tone.
咖啡|kāfēi|coffee|food|Both syllables have first tone. 喝咖啡 means drink coffee.
米饭|mǐfàn|cooked rice|food|The ordinary word for cooked rice as food. Compare 米, which commonly refers to uncooked rice.
菜|cài|vegetables / dish|food|Can mean vegetables or a prepared dish. A 菜 can contain meat; it does not always mean a vegetable dish.
来|lái|come|verbs|Often describes movement toward the speaker or the relevant place. Compare 去, go.
去|qù|go|verbs|Use before a destination: 去学校 means go to school. Compare 来, come.
回|huí|return / go back|verbs|回家 means return home. 回 can also mean reply in other contexts.
在|zài|be at / in|grammar|Use to give a location: 我在家 means I am at home. Before an action, 在 can also mark that it is in progress.
这里|zhèlǐ|here|place|Refers to this place. 我在这里 means I am here. 这儿 is another common form, not included as a separate entry in this course.
今天|jīntiān|today|time|Both syllables have first tone. 今天 is today, 昨天 yesterday, and 明天 tomorrow.
明天|míngtiān|tomorrow|time|The day after today. 明 has second tone and 天 has first tone.
昨天|zuótiān|yesterday|time|The day before today. 昨 has second tone and 天 has first tone.
现在|xiànzài|now|time|Refers to the present time. Both syllables have fourth tone.
时候|shíhou|time / moment|time|Used in 什么时候 (shénme shíhou), meaning when. It is not the word for an hour; hou is neutral.
年|nián|year|time|Use 年 for years and dates. For a person's age in years, use 岁 instead.
月|yuè|moon / month|time|In dates, a number plus 月 names the month: 三月 is March. 月 also means moon; everyday speech often uses 月亮 for the moon.
天|tiān|day / sky|time|Can mean day or sky. 三天 means three days; 今天 means today.
星期|xīngqī|week|time|星期一 through 星期六 name Monday through Saturday. Sunday is 星期日 or 星期天.
点|diǎn|o'clock / point|time|After a number, 点 gives the hour: 三点 means three o'clock. It has several other meanings, including point or dot.
大|dà|big / large|size|Describes something big or large. In a simple description say 很大, rather than inserting 是 before 大.
小|xiǎo|small|size|Describes something small. Compare 大, big. 小 can also relate to being young in other contexts.
多|duō|many / much|size|Describes a large quantity. 很多 means many or a lot; compare 少, few or little.
少|shǎo|few / little|size|Describes a small quantity. This meaning is shǎo; shào belongs to other uses of the character.
好|hǎo|good|feelings|Use hǎo for good or well. 好 also has the reading hào in other words, so its pronunciation depends on meaning.
热|rè|hot|feelings|Can describe hot weather or feeling hot. Compare 冷, cold.
冷|lěng|cold|feelings|Can describe cold weather or feeling cold. Compare 热, hot.
忙|máng|busy|feelings|我很忙 means I am busy. 很 can make a simple description natural without strongly emphasizing very.
累|lèi|tired|feelings|Use lèi when describing tiredness. 累 has different readings in other words; learn this reading with its meaning.
高兴|gāoxìng|happy / pleased|feelings|Expresses happiness or pleasure. The tones are first then fourth.
学生|xuésheng|student|learning|A person who studies at a school or similar institution. Sheng is neutral in the pronunciation taught here.
老师|lǎoshī|teacher|learning|An everyday word and form of address for a teacher. Do not pronounce the second syllable like the neutral sheng in 学生.
学校|xuéxiào|school|place|A place of education. The tones are second then fourth.
学习|xuéxí|study / learn|learning|Used for learning or studying. 学习汉语 means study Chinese.
汉语|hànyǔ|Chinese language|learning|Refers to the Chinese language. In this course the spoken variety taught is standard Mandarin; 中文 is another common term for Chinese.
看-look|kàn|look / watch / read|verbs|Use kàn for looking, watching, or reading. 看书 means read a book. 看 also has the reading kān for guarding or looking after.
听|tīng|listen / hear|verbs|Use for listening or hearing. 听老师说 means listen to the teacher speak.
说|shuō|speak / say|verbs|Use for speaking or saying something. 说汉语 means speak Chinese.
读|dú|read|learning|Can mean reading silently or aloud. 看书 is also used for reading, so 看 and 读 are not always contrasting answers.
写|xiě|write|learning|写字 means to write characters. The tone mark goes on e in xiě.
书|shū|book|things|An everyday word for book. 看书 means read a book; use 本 as the classifier when counting books.
字|zì|written character|learning|A written character, as in 汉字. A Chinese word may contain one character or several characters.
的|de|marks possession / description|grammar|Links an owner or description to a noun: 我的书 means my book. This grammatical use is neutral de; the character has other readings in other words.
这|zhè|this|place|Points to something nearby or being discussed. Compare 那, that. Before classifiers you may also hear zhèi.
那|nà|that|place|Points to something farther away or already mentioned. Compare 这, this. Before classifiers you may also hear nèi.
钱|qián|money|shopping|An everyday word for money. 多少钱 means how much money or how much does it cost.
买|mǎi|buy|shopping|Third tone. Do not confuse 买 (buy) with 卖 (mài, sell), which has a different tone and an extra part at the top.
多少|duōshao|how much / how many|questions|Asks about an amount or number. 多少钱 asks the price. Shao is neutral in this question word as taught here.
商店|shāngdiàn|shop / store|place|A place where things are sold. The tones are first then fourth.
块|kuài|yuan (spoken) / piece|shopping|In everyday price expressions, 块 is the spoken unit for yuan: 三块钱 means three yuan. It also counts pieces or chunks of things.'''
rows=[l.split('|') for l in DATA.splitlines()];assert len(rows)==100
for r in rows:assert len(r)==5,r
# Supplementary entries retained for old saves, outside the first-100 course.
SUP='''日|sun / day|A character used for sun or day, especially in compounds and written dates. For the sun in ordinary conversation, 太阳 is usual; 天 is common when counting days.
火|fire|Means fire and appears in many compounds. Its third tone is often low in connected speech.
山|mountain|An everyday noun meaning mountain. The first tone stays high and level.
木|wood (character)|A character meaning wood or tree, often used inside compounds. 树 is the usual everyday word for a tree.
口|mouth / opening|Can mean mouth or an opening. 嘴 is also common for mouth in conversation; 口 occurs in many compounds and counting expressions.
女|woman / female|A character meaning female or woman. 女人 and 女性 are fuller words; 女 also appears as a component in other characters.
子|child (character)|A character meaning child or son in some words. Everyday child is usually 孩子; 子 is neutral in words such as 孩子 and 名字, but zǐ in 儿子's first component is not implied.
中|middle / center|Zhōng means middle or center and appears in 中国 (China). China is not the meaning of 中 in every context. The character also has the reading zhòng in other uses.
国|country (character)|Means country or state, usually inside a compound such as 中国 or 国家. Do not replace the full country name 中国 with 国 alone.
上|above / up|Can mean above or up. It also has other uses in phrases such as 上学, go to school.
下|below / down|Can mean below or down. It also has other uses, so the whole phrase determines the meaning.
手|hand|Means hand. It also appears in 手机 (mobile phone), where translating each character separately does not give the whole word's meaning.
目|eye (character)|A character meaning eye, mostly used in compounds. The ordinary conversational word for eye is 眼睛 (yǎnjing). 目 and 木 sound alike.
田|field|Usually refers to cultivated land, especially in compounds. It is useful character knowledge but not a priority for the first conversational lessons.
石|stone (character)|A character meaning stone, commonly used in compounds. 石头 (shítou) is an everyday word for a stone. 石 also has another reading in a traditional unit of measure.
门|door / gate|An everyday noun meaning door or gate. It has a rising second tone.
车|vehicle / car|An everyday word for a vehicle or car. The character has the reading jū in some specialized contexts, such as Chinese chess.
马|horse|An everyday noun meaning horse. Its third tone is different from the neutral tone of the question particle 吗.
鸟|bird|An everyday noun meaning bird. Its third tone is often low in connected speech.
鱼|fish|An everyday noun meaning fish, including fish as food. It has a rising second tone.
米|uncooked rice|Commonly means uncooked rice or rice grain. 米饭 is the ordinary word for cooked rice; 米 can also mean meter as a unit of length.
父|father (character)|A character meaning father, usually in compounds such as 父亲. 爸爸 is the everyday beginner word for dad.
母|mother (character)|A character meaning mother, usually in compounds such as 母亲. 妈妈 is the everyday beginner word for mom.
学|learn / study|Can mean to learn or study. 学习 is a common fuller word; 学 also appears in 学生 and 学校.
生|life / be born|A character with several meanings, including life, being born, and raw. Learn its meaning in complete words; 学生 means student, not study-life.
看-guard|guard / look after|Use kān for guarding or looking after, as in 看门 (kān mén). This is a different reading of the same character as kàn, look/watch/read.
了|marks an event or new situation|Neutral le is used after verbs for completed events or at sentence end for a new situation. It is not a general past-tense ending; other words use the reading liǎo.'''
sup={r[0]:r[1:] for r in (l.split('|') for l in SUP.splitlines())}
sup['子'][1]='A character meaning child or son in some words. Everyday child is usually 孩子. 子 has the dictionary reading zǐ, but is neutral in common words such as 孩子 and 名字.'
# dictionary snapshot
D={};pattern=re.compile(r'^(\S+) (\S+) \[([^]]+)\] /(.*)/$')
for line in gzip.open(ROOT/'cedict.gz','rt'):
 m=pattern.match(line)
 if m:D.setdefault(m[2],[]).append({'traditional':m[1],'pinyin':m[3],'definition':m[4],'raw':line.strip()})
marks={'a':'āáǎà','e':'ēéěè','i':'īíǐì','o':'ōóǒò','u':'ūúǔù','ü':'ǖǘǚǜ'}
def tone(s):
 s=s.lower().replace('u:','ü');n=int(s[-1]) if s[-1:].isdigit() else 5;s=s[:-1] if s[-1:].isdigit() else s
 if n==5:return s
 k=next((s.index(v) for v in ['a','e'] if v in s),-1)
 if k<0:k=s.index('o') if 'ou' in s else max((i for i,c in enumerate(s) if c in marks),default=-1)
 if k>=0:s=s[:k]+marks[s[k]][n-1]+s[k+1:]
 return s
def key(s):return re.sub(r"[\s'’\-]",'',s.lower())
def match(h,p):
 return [d for d in D.get(h,[]) if key(''.join(tone(s) for s in d['pinyin'].split()))==key(p)]
DATE='2026-11-01'
review={'status':'ai-draft','note':'Reading and selected dictionary sense checked against the cited CC-CEDICT snapshot; teaching note edited by AI. Not reviewed by a human Mandarin teacher.'}
newby=copy.deepcopy(oldby)
for id,py,meaning,group,note in rows:
 w=newby.get(id,{'hanzi':id,'kind':'word'})
 w.update(pinyin=py,meaning=meaning,group=group,note=note)
 newby[id]=w
for id,(meaning,note) in sup.items():
 newby[id].update(meaning=meaning,note=note,kind='character' if id!='了' and id!='看-guard' else ('particle' if id=='了' else 'word'))
assert set(oldby)<=set(newby)
assert set(oldby)-{r[0] for r in rows}==set(sup),set(oldby)-{r[0] for r in rows}-set(sup)
selected={r[0] for r in rows}
for id,w in newby.items():
 if id in selected and w.get('kind')!='particle':w['kind']='word'
 hits=match(w['hanzi'],w['pinyin']);assert hits,(id,w['pinyin'])
 # Select the traditional headword matching the modern sense, avoiding variant-only entries when possible.
 hit=next((h for h in hits if not h['definition'].startswith(('variant of','old variant','used in'))),hits[0])
 w.pop('wrongPinyin',None)
 neutral=[i+1 for i,s in enumerate(hit['pinyin'].split()) if s.endswith('5')]
 if neutral:w['neutral']=neutral
 else:w.pop('neutral',None)
 w['source']=[{'name':'CC-CEDICT','ref':f"{hit['traditional']} {w['hanzi']} [{hit['pinyin']}]",'retrieved':DATE,'note':'Reading and selected sense checked; shortened English gloss and usage note are editorial adaptations.'},{'name':'HH-editorial-2026'}]
 w['review']=copy.deepcopy(review)
 # Prevent uncontextualized polyphone and sound-transcription questions with current engine; no code changes.
 q=['meaning','character','pinyin2char','homophone','lookalike']
 sounds={key(''.join(tone(s) for s in d['pinyin'].split())) for d in D[w['hanzi']]}
 allowed={key(w['pinyin']),*(key(v) for v in w.get('variants',[]))}
 if sounds<=allowed:q.append('pinyin')
 if w.get('kind')=='particle':q=['meaning','particle']
 elif w.get('audio')!='none':q+=['listen','listen2meaning']
 w['questions']=q
 if len(sounds)>1 and len(w['hanzi'])==1:w['audio']='none';w['questions']=[v for v in q if not v.startswith('listen')]
 # No listen2pinyin or meaning2pinyin: current code does not disambiguate heard sandhi and synonym readings reliably.
# Specific speech and pronunciation variants
newby['这']['variants']=['zhèi'];newby['那']['variants']=['nèi'];newby['哪']['variants']=['něi']
newby['一']['variants']=['yāo']
newby['个']['speech']=[{'pinyin':'ge','context':'Often neutral after a number or demonstrative, for example 一个 (yí ge).'}]
# Homophones and overlapping translations: symmetric exclusions.
for pair in [('二','两'),('学','学习'),('看-look','读'),('想','要'),('父','爸爸'),('母','妈妈'),('子','孩子'),('米','米饭'),('日','天'),('你','您'),('有','在'),('喜欢','好'),('这','这里'),('中','国')]:
 a,b=pair
 for x,y in [(a,b),(b,a)]:newby[x]['confusable']=list(dict.fromkeys(newby[x].get('confusable',[])+[y]))
# Preserve useful visual comparisons, add only clear same-length pairs.
for a,b in [('喝','渴')]:
 if a in newby and b in newby:newby[a]['lookalike']=list(dict.fromkeys(newby[a].get('lookalike',[])+[b]))
words=[newby[w.get('id',w['hanzi'])] for w in old]+[newby[r[0]] for r in rows if r[0] not in oldby]
# Official mappings: exact headword and selected reading only, never infer a level from a component.
H=json.loads((ROOT/'hsk-map.json').read_text())
lesson_titles=['Polite everyday expressions','People in a conversation','Simple statements and questions','Names and questions','Numbers one to five','Numbers six to ten','Counting and having','People and family','Brothers, sisters, and children','Wants and everyday actions','Food and drinks','Going places','Talking about time','Dates and the clock','Describing size and quantity','Feelings and conditions','School and learning','Language skills','Books and pointing things out','Shopping and prices']
units=[];mapping={}
for i,title in enumerate(lesson_titles):
 intros=[]
 for r in rows[5*i:5*i+5]:
  id=r[0];w=newby[id];intro={'entryId':id}
  hits=H.get(w['hanzi'],[])
  # Since the syllabus's pinyin may differ in neutral-tone conventions, manually review differences below.
  matches=[h for h in hits if key(h['pinyin']) in {key(w['pinyin']),*(key(v) for v in w.get('variants',[]))}]
  if matches:
   h=matches[0];intro['officialLevels']=[{'source':'HSK-2025','edition':'HSK syllabus published 2025-11; effective 2026-07','level':h['level'],'ref':f"Vocabulary entry {h['entry']}; printed page {h['printedPage']} (PDF page {h['pdfPage']}); {w['hanzi']} {h['pinyin']}"}];mapping[id]=h
  intros.append(intro)
 units.append({'id':f'b100-unit-{i+1:02}','title':title,'lessons':[{'id':f'b100-lesson-{i+1:02}','title':title,'prerequisiteLessons':[] if i==0 else [f'b100-lesson-{i:02}'],'introductions':intros}]})
course={'id':'beginner-mandarin-100','version':1,'title':'First 100 everyday words','description':'Twenty five-entry lessons for beginner Mandarin. Dictionary-checked vocabulary and exact official syllabus mappings where verified. Editorial teaching order awaiting human educator review.','provisional':True,'readiness':{'minLevel':1},'units':units,'source':[{'name':'HSK-2025','note':'Official level mappings guide coverage; the lesson sequence is editorial.'},{'name':'HH-editorial-2026'}],'review':{'status':'ai-draft','note':'Deliberate practical sequence; not reviewed by a human Mandarin teacher.'}}
# Keep compatibility course for old save identities, but it is no longer selected.
cf=json.loads((C/'curricula.json').read_text());cf['default']=course['id'];cf['curricula']=[c for c in cf['curricula'] if c['id']!=course['id']]+[course]
# One simple sentence per lesson; these are clearly labelled original teaching drafts.
EXAMPLES=[
('谢谢你！','Xièxie nǐ!','Thank you!'),
('她是我的朋友。','Tā shì wǒ de péngyou.','She is my friend.'),
('你是学生吗？','Nǐ shì xuésheng ma?','Are you a student?'),
('你叫什么名字？','Nǐ jiào shénme míngzi?','What is your name?'),
('我有三个朋友。','Wǒ yǒu sān ge péngyou.','I have three friends.'),
('现在是八点。','Xiànzài shì bā diǎn.','It is eight o’clock now.'),
('我有两个孩子。','Wǒ yǒu liǎng ge háizi.','I have two children.'),
('我妈妈在家。','Wǒ māma zài jiā.','My mom is at home.'),
('我有一个哥哥。','Wǒ yǒu yī ge gēge.','I have an older brother.'),
('我想喝水。','Wǒ xiǎng hē shuǐ.','I want to drink water.'),
('我喜欢喝茶。','Wǒ xǐhuan hē chá.','I like drinking tea.'),
('我明天去学校。','Wǒ míngtiān qù xuéxiào.','I am going to school tomorrow.'),
('你什么时候回家？','Nǐ shénme shíhou huí jiā?','When are you going home?'),
('今天是星期五。','Jīntiān shì xīngqīwǔ.','Today is Friday.'),
('我的学校很大。','Wǒ de xuéxiào hěn dà.','My school is big.'),
('我今天很忙。','Wǒ jīntiān hěn máng.','I am busy today.'),
('我学习汉语。','Wǒ xuéxí Hànyǔ.','I study Chinese.'),
('我喜欢看书。','Wǒ xǐhuan kàn shū.','I like reading.'),
('这是我的书。','Zhè shì wǒ de shū.','This is my book.'),
('这本书多少钱？','Zhè běn shū duōshao qián?','How much is this book?')]
exreview={'status':'ai-draft','note':'Original short teaching example checked by AI for consistency; not copied from a corpus and not human-reviewed. Pinyin uses dictionary tones; connected-speech changes are explained separately.'}
# Rewrite all legacy explanations to remove unverified history/phonetic-component claims; retain useful comparisons.
expl={}
for id,w in newby.items():
 ex={'title':f"{w['hanzi']} ({w['pinyin']})",'summary':w['note'],'sections':[{'type':'text','heading':'Meaning in this course','body':w['note']}],'source':w['source'],'review':copy.deepcopy(review)}
 comparisons=[x for x in w.get('lookalike',[]) if x in newby][:3]
 if comparisons:
  ex['sections'].append({'type':'compare','heading':'Compare the written forms','items':[{'char':newby[x]['hanzi'],'pinyin':newby[x]['pinyin'],'meaning':newby[x]['meaning']} for x in [id]+comparisons]});ex['related']=comparisons
 examples=[]
 for zh,py,en in EXAMPLES:
  if w['hanzi'] in zh and len(examples)<2:
   examples.append({'zh':zh,'pinyin':py,'en':en,'audio':False,'note':'Optional example; it may contain vocabulary introduced in a later lesson. Pinyin shows dictionary tones.','source':[{'name':'HH-editorial-2026'}],'review':exreview})
 if examples:ex['sections'].append({'type':'examples','heading':'Optional example','items':examples})
 if w.get('speech'):
  ex['sections'].append({'type':'tips','heading':'Dictionary spelling and speech','items':[s['pinyin']+': '+s['context'] for s in w['speech']]})
 expl[id]=ex
# Correct and gate the three existing authored exercises. Leave them labelled AI draft; do not claim corpus or human review.
cloze=[
{'id':'ma-student','answer':'吗','zh':'你是学生___？','pinyin':'Nǐ shì xuésheng ___?','en':'Are you a student?','options':['吗','的','了'],'why':{'的':'的 does not turn this statement into the intended yes/no question.','了':'了 does not supply the intended yes/no question marker here.'},'note':'A statement followed by 吗 can ask a yes/no question.','prerequisiteEntries':['你','是','学生'],'source':[{'name':'HH-editorial-2026'}],'review':exreview},
{'id':'de-book','answer':'的','zh':'这是我___书。','pinyin':'Zhè shì wǒ ___ shū.','en':'This is my book.','options':['吗','的','了'],'why':{'吗':'吗 does not link the owner 我 to the noun 书.','了':'了 does not link the owner 我 to the noun 书.'},'note':'我的书 means my book.','prerequisiteEntries':['这','是','我','书'],'source':[{'name':'HH-editorial-2026'}],'review':exreview},
{'id':'le-tv','answer':'了','zh':'他来___。','pinyin':'Tā lái ___.','en':'He has arrived; he is here now.','options':['吗','的','了'],'why':{'吗':'吗 would ask a yes/no question, not state the new situation in the English cue.','的':'的 does not mark the arrival as a newly relevant situation in this sentence.'},'note':'Sentence-final 了 can mark a new situation. It is not a universal past-tense ending.','prerequisiteEntries':['他','来'],'source':[{'name':'HH-editorial-2026'}],'review':exreview}]
sources=json.loads((C/'sources.json').read_text())
sources['HH-editorial-2026']={'title':'Hanzi Hunters beginner-100 editorial draft, 2026-11-01','license':'CC BY-SA 4.0','attribution':'AI-assisted editorial adaptation prepared for Hanzi Hunters. Dictionary senses and readings checked against CC-CEDICT. Original examples and sequence are not human-reviewed.','usage':'Do not describe the material as teacher-approved. Retain source references and identify modifications.'}
sources['HSK-2025']={'title':'Official HSK syllabus, published November 2025, effective July 2026','url':'https://hsk.cn-bj.ufileos.com/3.0/%E6%96%B0%E7%89%88HSK%E8%80%83%E8%AF%95%E5%A4%A7%E7%BA%B21219.pdf','license':'Official reference; full syllabus not redistributed','attribution':'Center for Language Education and Cooperation; official syllabus linked by Chinese Testing International.','usage':'Individual factual level/page references only. Distinct from the 2021 proficiency standards and older HSK editions.'}
# Remove the inaccurate edition example in the inherited HSK registry.
sources['HSK']['title']='Official HSK materials (specify the exact syllabus edition)'
sources['HSK']['usage']='Distinguish the 2021 proficiency standards from the HSK syllabus published in 2025; do not infer levels.'
for name,obj in [('words.json',words),('explanations.json',expl),('cloze.json',cloze),('sources.json',sources),('curricula.json',cf)]:
 (C/name).write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n')
# Reproducible factual lookup evidence; reference snippets kept separately from the game UI.
evidence=[]
for id,w in newby.items():
 hit=match(w['hanzi'],w['pinyin'])
 evidence.append({'entryId':id,'hanzi':w['hanzi'],'pinyin':w['pinyin'],'selectedGloss':w['meaning'],'cedictMatches':hit,'officialMapping':mapping.get(id),'inFirst100':id in selected})
(OUT/'dictionary-checks.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+'\n')
(ROOT/'package-state.json').write_text(json.dumps({'selected':[r[0] for r in rows],'mapping':mapping,'oldIds':list(oldby)},ensure_ascii=False,indent=2))
print('Total retained entries',len(words),'first course',len(rows),'existing kept in course',len(selected&set(oldby)),'supplemental',len(sup),'new',len(set(newby)-set(oldby)))
print('Official mappings',len(mapping),'unmapped:',[(r[0],H.get(newby[r[0]]['hanzi'])) for r in rows if r[0] not in mapping])
# Final editorial ordering: 20 lessons of 4-6 entries; useful sentence building comes before large topic blocks.
GROUPS=[
('Polite everyday expressions','你好 谢谢 再见 请 对不起'),
('People in a conversation','我 你 他 她 您'),
('Your first descriptions and questions','是 人 好 很 吗'),
('Names and friends','叫 名字 谁 什么 朋友'),
('Having, negating, and belonging','不 也 有 没有 的'),
('Pointing and choosing','这 那 哪 这里 个'),
('Numbers one to five','一 二 三 四 五'),
('Numbers six to ten','六 七 八 九 十'),
('Counting, quantity, and size','零 两 多 少 大 小'),
('Home and family','家 妈妈 爸爸 孩子 喜欢'),
('Brothers, sisters, and happiness','哥哥 姐姐 弟弟 妹妹 高兴'),
('Wants, eating, and drinking','想 要 吃 喝 水'),
('Food and drinks','茶 咖啡 米饭 菜'),
('Going places','来 去 回 在 学校'),
('Today, tomorrow, and when','今天 明天 昨天 现在 时候'),
('Dates and the clock','年 月 天 星期 点'),
('How you feel','热 冷 忙 累'),
('School and learning','学生 老师 学习 汉语 字'),
('Reading, speaking, and writing','看-look 听 说 读 写 书'),
('Shopping and prices','钱 买 多少 商店 块')]
sequence=[id for _,ids in GROUPS for id in ids.split()];assert len(sequence)==100 and set(sequence)==selected
newby['学生']['variants']=['xuéshēng']
newby['学生']['note']='Student. CC-CEDICT records xuésheng with neutral sheng; the official 2025 HSK syllabus gives xuéshēng. Both are accepted here. Do not confuse 学生 with 老师 (teacher).'
newby['学生']['source'].append({'name':'HSK-2025','ref':'Vocabulary entry 248, 学生 xuéshēng; printed page 83 (PDF page 86)','retrieved':DATE,'note':'Full first tone on the second syllable is an accepted syllabus pronunciation.'})
# Correct extraction of the first level in the printed 1(2)(4) annotation for 好.
H['好'][0]['level']='1'
for id in ['谁','学生','好']:mapping[id]=H[newby[id]['hanzi']][0]
course['description']='Twenty lessons of 4-6 entries for beginner Mandarin. Every entry has a dictionary check and an exact official syllabus reference. Editorial teaching order awaiting human educator review.'
course['units']=[]
for i,(title,ids) in enumerate(GROUPS):
 intros=[]
 for id in ids.split():
  h=mapping[id];w=newby[id]
  intros.append({'entryId':id,'officialLevels':[{'source':'HSK-2025','edition':'HSK syllabus published 2025-11; effective 2026-07','level':h['level'],'ref':f"Vocabulary entry {h['entry']}; printed page {h['printedPage']} (PDF page {h['pdfPage']}); {w['hanzi']} {h['pinyin']}"}]})
 course['units'].append({'id':f'b100-unit-{i+1:02}','title':title,'lessons':[{'id':f'b100-lesson-{i+1:02}','title':title,'prerequisiteLessons':[] if i==0 else [f'b100-lesson-{i:02}'],'introductions':intros}]})
# Attach examples only to the lexical items actually used with the intended reading and sense.
TOKENS=['谢谢 你','她 是 我 的 朋友','你 是 学生 吗','你 叫 什么 名字','我 有 三 个 朋友','现在 是 八 点','我 有 两 个 孩子','我 妈妈 在 家','我 有 一 个 哥哥','我 想 喝 水','我 喜欢 喝 茶','我 明天 去 学校','你 什么 时候 回 家','今天 是 星期 五','我 的 学校 很 大','我 今天 很 忙','我 学习 汉语','我 喜欢 看-look 书','这 是 我 的 书','这 书 多少 钱']
for id,w in newby.items():
 ex=expl[id];ex['summary']=w['note'];ex['sections']=[s for s in ex['sections'] if s['type']!='examples'];ex['sections'][0]['body']=w['note'];ex['source']=w['source']
 examples=[]
 for (zh,py,en),tokens in zip(EXAMPLES,TOKENS):
  if id in tokens.split() and len(examples)<2:examples.append({'zh':zh,'pinyin':py,'en':en,'audio':False,'note':'Optional example; unfamiliar words may appear. Pinyin uses dictionary tones, including yī in 一个; the spoken form there is yí ge.','source':[{'name':'HH-editorial-2026'}],'review':exreview})
 if examples:ex['sections'].append({'type':'examples','heading':'Optional example','items':examples})
# Meaning-specific pair comparison avoids suggesting all readings of a written character are interchangeable.
# An example about 看-look must never be attached to 看-guard.
assert not any(s['type']=='examples' for s in expl['看-guard']['sections'])
words=[newby[w.get('id',w['hanzi'])] for w in old]+[newby[r[0]] for r in rows if r[0] not in oldby]
for name,obj in [('words.json',words),('explanations.json',expl),('curricula.json',cf)]: (C/name).write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n')
for e in evidence:e['officialMapping']=mapping.get(e['entryId'])
(OUT/'dictionary-checks.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+'\n')
(ROOT/'package-state.json').write_text(json.dumps({'selected':sequence,'mapping':mapping,'oldIds':list(oldby)},ensure_ascii=False,indent=2))
print('Final ordering:',len(sequence),'mapped:',len(mapping),'level counts:',{l:sum(m['level']==l for m in mapping.values()) for l in ['1','2','3']})
# Short answer glosses must not share an artificial '(character)' token: the engine treats shared English words as overlap.
for id,w in newby.items():
 w['meaning']=w['meaning'].replace(' (character)','')
 if id=='木':w['meaning']='wood / tree'
 # Isolated, single-reading syllables without speech variants may safely use the existing listening-pinyin format.
 sounds={key(''.join(tone(s) for s in d['pinyin'].split())) for d in D[w['hanzi']]}
 if len(w['hanzi'])==1 and len(sounds)==1 and not w.get('speech') and not w.get('variants') and not w.get('confusable') and w.get('kind')!='particle':
  w['questions']=list(dict.fromkeys(w['questions']+['meaning2pinyin']+(['listen2pinyin'] if w.get('audio')!='none' else [])))
# Seven's short note is sufficient; keep the existing API fixture which intentionally uses 七 as an entry without a long popup.
expl.pop('七',None)
# Reflect gloss edits in comparison panels and evidence.
for ex in expl.values():
 for sec in ex['sections']:
  if sec['type']=='compare':
   for it in sec['items']:
    found=next((w for w in newby.values() if w['hanzi']==it['char'] and w['pinyin']==it['pinyin']),None)
    if found:it['meaning']=found['meaning']
words=[newby[w.get('id',w['hanzi'])] for w in old]+[newby[r[0]] for r in rows if r[0] not in oldby]
for name,obj in [('words.json',words),('explanations.json',expl)]: (C/name).write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n')
for e in evidence:e['selectedGloss']=newby[e['entryId']]['meaning']
(OUT/'dictionary-checks.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+'\n')
